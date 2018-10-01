/**
 * (c) 2018 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

"use strict";

const Path = require( "path" );
const Child = require( "child_process" );

const File = require( "file-essentials" );


/**
 * Exposes controller with actions for managing deployment of applications.
 *
 * @this HitchyAPI
 * @param {HitchyOptions} options options customizing hitchy runtime
 * @returns {object<string,function(Request, Response, function(Error))>} set of action handlers
 */
module.exports = function( options ) {
	const api = this;

	const Log = api.log( "actord:deploy" );
	const Debug = api.log( "actord:deploy.debug" );

	return {
		trigger: function( request, response ) {
			const { name, token } = request.params;

			if ( name && token ) {
				const applicationFolder = Path.join( options.projectFolder, "actors", name );
				const tokenFile = Path.join( applicationFolder, ".token" );
				const scriptFile = Path.join( applicationFolder, "run.sh" );

				return File.read( tokenFile )
					.then( content => {
						const required = content.toString( "utf8" ).trim();
						if ( token !== required ) {
							throw Object.assign( new Error( `invalid token` ), { code: 403 } );
						}

						Log( `request for action ${name} => ${scriptFile}` );

						return File.stat( scriptFile )
							.then( stat => {
								if ( stat && stat.isFile() ) {
									const context = {
										detached: false,
									};

									return Promise.race( [
										// invoke script waiting for it to complete
										_invoke( name, scriptFile, context )
											.then( result => {
												Log( `script ${scriptFile} ${context.detached ? "eventually " : ""}exited with code ${result.exitCode}` );

												if ( context.detached ) {
													result.output.forEach( logCapturedOutput );
												} else {
													context.detached = true;
												}

												return result;
											}, error => {
												Log( `script ${scriptFile} ${processed ? "eventually " : ""}failed: ${error.message}` );

												throw error;
											} ),
										// respond to client after delay of 3 seconds
										new Promise( resolve => {
											setTimeout( () => {
												if ( !context.detached ) {
													context.detached = true;

													Log( `detaching action ${name}` );
												}

												resolve( {
													exitCode: NaN,
													output: [],
													error: null,
													detached: true,
												} );
											}, 3000 );
										} ),
									] )
										.then( result => response.json( result ) );
								}
							} );
					} )
					.catch( error => {
						switch ( error.code ) {
							case "ENOENT" :
							case "ENOTDIR" :
								Log( `request failed: ${error.message}` );
								error = new Error( "invalid actor setup" );
						}

						response
							.status( parseInt( error.code ) || 500 )
							.json( {
								error: `request failed: ${error.message}`,
							} );
					} );
			}

			response
				.status( 400 )
				.json( {
					error: "invalid or missing parameters"
				} );
		},
	};



	const Locks = {};

	function logCapturedOutput( { channel, chunk } ) {
		Debug( `${channel}: ${chunk.toString( "utf8" )}` );
	}

	function _invoke( actorName, scriptFile, context ) {
		if ( Locks[actorName] ) {
			return Promise.reject( Object.assign( new Error( "actor is locked currently" ), { code: 423 } ) );
		}

		Locks[actorName] = true;

		return new Promise( ( resolve, reject ) => {
			const child = Child.exec( scriptFile );

			let stage = 0;

			const data = {
				exitCode: null,
				output: [],
				error: null,
				detached: false,
			};

			child.on( "error", _fail );
			child.on( "exit", code => {
				data.exitCode = code;
				_advance();
			} );

			child.stdout.on( "data", chunk => {
				const block = {
					channel: "stdout",
					chunk,
				};

				if ( context.detached ) {
					data.output.forEach( logCapturedOutput );
					data.output.splice( 0 );

					logCapturedOutput( block );
				} else {
					data.output.push( block );
				}
			} );
			child.stdout.on( "error", _fail );
			child.stdout.on( "end", _advance );

			child.stderr.on( "data", chunk => {
				const block = {
					channel: "stderr",
					chunk,
				};

				if ( context.detached ) {
					data.output.forEach( logCapturedOutput );
					data.output.splice( 0 );

					logCapturedOutput( block );
				} else {
					data.output.push( block );
				}
			} );
			child.stderr.on( "error", _fail );
			child.stderr.on( "end", _advance );

			function _close() {
				return new Promise( resolve => {
					if ( data.exitCode == null ) {
						child.kill( "SIGTERM" );
						child.on( "exit", resolve );
					} else {
						resolve();
					}
				} );
			}

			function _fail( error ) {
				data.error = error;

				_close().then( () => reject( error ) );
			}

			function _advance() {
				if ( ++stage >= 3 && !data.error ) {
					resolve( data );
				}
			}
		} )
			.then( result => {
				Locks[actorName] = false;
				return result;
			}, error => {
				Locks[actorName] = false;
				throw error;
			} );
	}
};

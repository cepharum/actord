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

const Debug = require( "debug" )( "application.deploy" );
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

	return {
		deploy: function( request, response ) {
			const { name, token } = request.params;

			if ( name && token ) {
				const applicationFolder = Path.join( options.projectFolder, "registry", name );
				const tokenFile = Path.join( applicationFolder, ".token" );
				const scriptFile = Path.join( applicationFolder, "run.sh" );

				return File.read( tokenFile )
					.then( content => {
						const required = content.toString( "utf8" ).trim();
						if ( token !== required ) {
							throw Object.assign( new Error( `invalid token` ), { code: 403 } );
						}

						return File.stat( scriptFile )
							.then( stat => {
								if ( stat && stat.isFile() ) {
									return _invoke( scriptFile )
										.then( result => {
											response.json( result );
										} );
								}
							} );
					} )
					.catch( error => {
						switch ( error.code ) {
							case "ENOENT" :
							case "ENOTDIR" :
								Debug( `request failed: ${error.message}` );
								error = new Error( "invalid registry setup" );
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
};

function _invoke( scriptFile ) {
	return new Promise( ( resolve, reject ) => {
		const child = Child.exec( scriptFile );

		let stage = 0;

		const data = {
			exitCode: null,
			output: [],
		};

		child.on( "error", reject );
		child.on( "exit", code => {
			data.exitCode = code;
			_advance();
		} );

		child.stdout.on( "data", chunk => data.output.push( {
			channel: "stdout",
			chunk,
		} ) );
		child.stdout.on( "error", reject );
		child.stdout.on( "end", _advance );

		child.stderr.on( "data", chunk => data.output.push( {
			channel: "stderr",
			chunk,
		} ) );
		child.stderr.on( "error", reject );
		child.stderr.on( "end", _advance );

		function _advance() {
			if ( ++stage >= 3 ) {
				resolve( data );
			}
		}
	} );
}

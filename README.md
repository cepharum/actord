# actord

This service is exposing web hook for triggering custom actors.

## Running with ...

### docker

```bash
docker build -t actord .
docker run -P actord
```

This docker container is limited to work with files in that container, only. You might want to bind folder containing your desired actors to **/app/actors**. In addition you might e.g. need to bind the socket controlling docker so actors are capable of performing actions beyond scope of this container,

```bash
docker run -P -v /path/to/your/actors:/app/actors,ro actord
```

Keep in mind that scripts of any actor bound this way are still limited to accessing the filesystem of the container by default.

### systemd

1. Create a new user that's not used with any other application on your server. Let's name it `actord`:  
   ```bash
   useradd -d /dev/null -s /bin/false actord
   usermod -L actord
   ```
2. Extract the project's files into folder of your choice, e.g. **/opt/actord**.
3. Move file **actord.service** to **/etc/systemd/system**.
4. Open resulting **/etc/systemd/system/actord.service** in a text editor of your choice and
   * replace `/path/to` in line starting with `WorkingDirectory=` with the path name of folder this tool has been extracted to before.
   * ensure user created before is named in line starting with `User=`.
4. Reload **systemd** by invoking `systemctl daemon-reload`.
5. Start the service with `systemctl start actord.service`.
6. Check the status and logs with `journalctl -xeu actord.service`.
7. Try accessing service using browser. It's listening on port 3000, so open URL .
8. Enable the service persistently with `systemctl enable actord.service`.


## Actors

> The following description assumes you have been precisely following instructions on how to run `actord` with `systemd` and thus was extracting its files into folder **/opt/actord** as well as having created user `actord` for running it. Please adopt the following instructions on having chosen different values.

Every actor is defined by adding a subfolder in **/opt/actord/actors**. For example, the subfolder **/opt/actord/actors/some-actor** defines an actor named **some-actor** implicitly.

Such a folder consists of at least two files:

1. The file **.token** is containing a single line of text. Its content must be provided in URL of request triggering the actor.
2. The script file **run.sh** gets invoked on a valid request via exposed web service. Its exit code and output on _stdout_ as well as _stderr_ is passed back to the requesting client in a JSON record.

### Considerations

#### Performance

* `actord` features support for long running actors by detaching them from any triggering request.

#### Security

* Neither **.token** nor **run.sh** should be owned by user `actord` to prevent the service accidentally modifying or removing either file.
* The actor's folder itself should be owned by user `actord` and hidden from world access to make it available to the user `actord`, only. This prevents other users from reading your **.token** file or any other sensitive detail about your desired actions.

Listing the resulting folder with `ls -la` should look like this:

```bash
drwxr-x--- 2 actord root 4096 Sep 28 21:43 .
drwxr-xr-x 3 root   root 4096 Sep 28 20:42 ..
-rwxr-xr-x 1 root   root   86 Sep 28 21:43 run.sh
-rw-r--r-- 1 root   root   40 Sep 28 20:43 .token
```

### Privileged Actors

When running the service with **systemd** as described before any actor's **run.sh** script file is run as the non-privileged user `actord`. This improves security e.g. for running the service without privileged access, but limits an actor's possibilities in **run.sh**. However, by using `sudo` it is possible to safely elevate actor's permissions:

1. Make sure to comply with basic security considerations provided before.
2. Put another script, e.g. named **.run.root.sh**, into the actor's folder. This file should be visible to user `root`, only. Optionally, replace `root` here and in next steps with name of any user you want to run the actor as instead.
3. Configure `sudo` by running `visudo` for adding this line:  
   ```
   actord = (root) NOPASSWD: /path/to/actord/actors/some-actor/.run.root.sh
   ```
4. Put this into **run.sh**:  
   ```bash
   sudo -u root /path/to/actord/actors/some-actor/.run.root.sh
   ```  
   > Make sure to use the file's absolute path name here so `sudo` is matching lines, properly.

Now, listing the resulting folder with `ls -la` should look like this:

```bash
drwxr-x--- 2 actord root 4096 Sep 28 21:43 .
drwxr-xr-x 3 root   root 4096 Sep 28 20:42 ..
-rwxr-x--- 1 root   root   54 Sep 28 21:00 .run.root.sh
-rwxr-xr-x 1 root   root   86 Sep 28 21:43 run.sh
-rw-r--r-- 1 root   root   40 Sep 28 20:43 .token
```

All your actor's elevated operations should be placed in **.run.root.sh** eventually. Consider limiting privileged access to parts of actor essentially requiring it. When running with privileged permissions you should not process any stuff fetched from external sources without another validation.

#### Troubleshooting

##### Requesting Script Fails With Sudo Requiring TTY Or Some Askpass

* Thoroughly check the line added with `visudo` again.
* Make sure invocation of `sudo` in **run.sh** is addressing **.run.root.sh** using its absolute path name.
* Even though `sudo` should not need to use a TTY at all it might help adding another line using `visudo`:  
  ```
  Defaults!/path/to/actord/actors/some-actor/.run.root.sh !requiretty
  ``` 

## Using HTTPS

`actord` is built with [hitchy](https://www.npmjs.com/package/hitchy). The latter features support for HTTPS just by using additional command line arguments passed on invoking `npm start` to provide names of files containing key and certificate required for SSL encryption:

```bash
npm start -- --sslKey=/path/to/key.pem --sslCert=/path/to/cert.pem --sslCaCert=/path/to/chain.pem
```

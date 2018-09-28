# pulling deployer

This service is exposing web hook for triggering pull for deploying configured application.

## Running with ...

### docker

```bash
docker build -t pulling-deployer .
docker run -P pulling-deployer
```

This docker container is limited to work with files in that container, only. You might want to bind folder containing your desired tasks to **/app/registry**. 

```bash
docker run -P -v /path/to/your/registry:/app/registry,ro pulling-deployer
```

Keep in mind that any script of a bound task is still limited to accessing the filesystem of the container by default.

### systemd

1. Create a new user that's not used with any other application on your server. Let's name it `deployer`.  
   ```bash
   useradd -d /dev/null -s /bin/false deployer
   ```
2. Extract the files into folder of your choice, e.g. **/opt/pulling-deployer**.
3. Move file **pulling-deployer.service** to **/etc/systemd/system**.
4. Open resulting **/etc/systemd/system/pulling-deployer.service** in a text editor of your choice and replace ...
   * `/path/to` in line starting with `WorkingDirectory=` with the path name of folder this tool has been extracted to before.
   * `nobody` in line starting with `User=` with the name of user created before, e.g. `deployer`.
4. Reload **systemd** by invoking `systemctl daemon-reload`.
5. Start the service with `systemctl start pulling-deployer.service`.
6. Check the status and logs with `journalctl -xeu pulling-deployer.service`.
7. Try accessing service using browser. It's listening on port 3000, so open URL .
8. Enable the service persistently with `systemctl enable pulling-deployer.service`.


## Tasks

> The following description assumes you have been extracting this tool into a folder with path name **/opt/pulling-deployer** and you've created user `deployer` to be used for running it as a service.

Every task is defined by a folder found in **/opt/pulling-deployer/registry**. For example, the folder **/opt/pulling-deployer/registry/some-task** defines a task named **some-task** implicitly.

Every such _task folder_ consists of at least two files:

1. The file **.token** is containing a single line of text. Its content must be provided in URL requesting to run the task.
2. The script file **run.sh** gets invoked on a valid request via exposed web service. Its exit code and output on _stdout_ as well as _stderr_ is passed back to the requesting client in a JSON record.

### Considerations

#### Performance

* If any task is expected to start some long-running action you should detach it from execution of **run.sh** as the incoming request gets blocked until this script has finished.

#### Security

* Neither **.token** nor **run.sh** should be owned by user `deployer` to prevent the service accidentally modifying or removing either file.
* The task's folder itself should be owned by user `deployer` and hidden from world access to make it available to the user `deployer`, only. This prevents other users from reading your **.token** file.

Listing the resulting folder with `ls -la` should look like this:

```bash
drwxr-x--- 2 deployer root 4096 Sep 28 21:43 .
drwxr-xr-x 3 root     root 4096 Sep 28 20:42 ..
-rwxr-xr-x 1 root     root   86 Sep 28 21:43 run.sh
-rw-r--r-- 1 root     root   40 Sep 28 20:43 .token
```

### Privileged Tasks

When running the service with **systemd** as described before any task's **run.sh** script file is run as the non-privileged user `deployer`. This limits the possibilities in **run.sh**. By using `sudo` it is possible to safely elevate its permissions:

1. Make sure to comply with basic security considerations provided before.
2. Put another script, e.g. named **.run.root.sh**, into the task's folder. This file should be visible to user `root`, only. Replace `root` here and in next step with name of any user you want to run the task as instead.
3. Configure `sudo` by running `visudo` for adding this line:  
   ```
   deployer = (root) NOPASSWD: /path/to/pulling-deployer/registry/some-task/.run.root.sh
   ```
4. Put this into **run.sh**:  
   ```bash
   sudo -u root /path/to/pulling-deployer/registry/some-task/.run.root.sh
   ```  
   > Make sure to use the file's absolute path name here so `sudo` is matching lines, properly.

Listing the resulting folder with `ls -la` should look like this:

```bash
drwxr-x--- 2 deployer root 4096 Sep 28 21:43 .
drwxr-xr-x 3 root     root 4096 Sep 28 20:42 ..
-rwxr-x--- 1 root     root   54 Sep 28 21:00 .run.root.sh
-rwxr-xr-x 1 root     root   86 Sep 28 21:43 run.sh
-rw-r--r-- 1 root     root   40 Sep 28 20:43 .token
```

All your task elevated operations should be placed in **.run.root.sh** eventually. Consider limiting privileged access to parts of task essentially requiring it. When running with privileged permissions you shouldn't process any stuff fetched from external sources for preparation before while lacking privileges unless filtering it again.

#### Troubleshooting

##### Requesting Script Fails With Sudo Requiring TTY Or Some Askpass

* Thoroughly check the line added with `visudo` again.
* Make sure invocation of `sudo` in **run.sh** is addressing **.run.root.sh** using its absolute path name.
* Even though `sudo` shouldn't need to use a TTY at all it might help adding another line using `visudo`:  
  ```
  Defaults!/path/to/pulling-deployer/registry/some-task/.run.root.sh !requiretty
  ``` 

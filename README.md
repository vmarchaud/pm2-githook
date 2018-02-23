## Description

PM2 module to receive http webhook from github, execute pre/post hook and gracefull reload the application using pm2.

This is a fork of the original pm2-githook(https://github.com/vmarchaud/pm2-githook) by vmarchaud. I found the error reporting lacking, ended up adding a few things like:
* A different log dir which includes the hook outputs (didn't want to populate pm2 logs with anything more than success/error messages)
* Automatic kill of any old running hooks for when your git pushes happen quicker than your hook completes

## Install/Update

`pm2 install rohit-smpx/pm2-githook2`

For now this is the way, until I publish this to npm.

## Configure

- `port` (Defaults to `8888`) : The port that will be used by the http server to receive hooks.
- `apps` : Contains definition of applications in JSON : 
- `logDir` : The log dir where all the logs will be stored, saved with an internal logrotate. This will also have the output of all the hooks output unlike pm2's logs of the module, which will only have success and error messages.

    ```json
      {
        "APP_NAME" : {
          "secret" : "supersecret",
          "prehook" : "npm install --production && git submodule update --init",
          "posthook" : "echo done",
          "service": "github"
        }
      }
    ```
    
    - `APP_NAME` is the name of the api **in pm2** and in the **url** defined on github or gitlab (eg: : `http://127.0.0.1:8888/APP_NAME`).
    - `secret` is the secret you put in github/gitlab to verify that the transaction is made by github/gitlab.
    - `prehook` is the shell command executed in the `cwd` **(care of this)** of the app after the `pull` and before the `gracefullReload`.
    - `posthook` is the shell command executed in the `cwd` **(care of this)** of the app after making the `gracefullReload`.
    - `service` is the service used to make the http call (`github` is the default)
      - `github` : you'll need to set the same secret as defined in github 
      - `gitlab` : you'll need to set the secret as the token defined in gitlab
      - `jenkins` : you'll need to set the secret as the ip of the jenkins (can specify branch)
      - `bitbucket` : secret not needed, bitbucket ip range is inside the code (can specify branch)
      - `droneci` : you'll need to set the secret to match the `Authorization` header defined inside the [plugin](http://addons.drone.io/webhook/) (can specify branch)
    - `nopm2` if set to true, we will not reload the application using pm2 (default to `false`)
    - `cwd` if provided we don't resolve the cwd using pm2 and will take this value (defaults to `undefined`)

`(can specify branch)`  mean that you can use a addional configuration to run the posthook on a specific branch

#### How to set these values ?

 After having installed the module you have to type :
`pm2 set pm2-githook:key value`

To set the `apps` option and since its a json string, i advice you to escape it to be sure that the string is correctly set ([using this kind of tool](http://bernhardhaeussner.de/odd/json-escape/)).

e.g: 
- `pm2 set pm2-githook:port 8080` (bind the http server port to 8080)
- `pm2 set pm2-githook:apps "{\"APP_NAME\":{\"secret\":\"supersecret\",\"prehook\":\"npm install --production && git submodule update --init\",\"posthook\":\"echo done\"}}"` 

## Uninstall

`pm2 uninstall pm2-githook2`

## Credits

@vmarchaud for the original pm2-githook(https://github.com/vmarchaud/pm2-githook) module on which this is based. 

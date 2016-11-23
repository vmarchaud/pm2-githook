## Description

PM2 module to receive http webhook from github, execute pre/post hook and gracefull reload the application using pm2.

## Install

`pm2 install pm2-githook`

## Configure

- `port` (Defaults to `8888`) : The port that will be used by the http server to receive hooks.
- `apps` : Contains definition of applications in JSON : 

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
      - `jenkins` : you'll need to set the secret as the ip of the jenkins (you can precise a `branch` entry to make action only for a branch)

#### How to set these values ?

 After having installed the module you have to type :
`pm2 set pm2-githook:key value`

To set the `apps` option and since its a json string, i advice you to escape it to be sure that the string is correctly set ([using this kind of tool](http://bernhardhaeussner.de/odd/json-escape/)).

e.g: 
- `pm2 set pm2-githook:port 8080` (bind the http server port to 8080)
- `pm2 set pm2-githook:apps "{\"APP_NAME\":{\"secret\":\"supersecret\",\"prehook\":\"npm install --production && git submodule update --init\",\"posthook\":\"echo done\"}}"` 

## Uninstall

`pm2 uninstall pm2-githook

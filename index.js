/**
 * Copyright 2016 vmarchaud. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

// var rotatingFileStream = require('rotating-file-stream');
var http = require('http');
var crypto = require('crypto');
var pmx = require('pmx');
var pm2 = require('pm2');
var util = require('util');
var spawn = require('child_process').spawn;
var async = require('async');
var vizion = require('vizion');
var ipaddr = require('ipaddr.js');

// var logStream = rotatingFileStream('githook.log', {
// 	interval: '1d',
// 	maxFiles: 10,
// 	path: '/smartprix/logs/server_logs',
// });
/**
 * Init pmx module
 */
pmx.initModule({}, function (err, conf) {
  pm2.connect(function (err2) {
    if (err || err2) {
      console.error('[%s] Error: %s', localeDateString(), JSON.stringify(err || err2));
      return process.exit(1);
    }
    // init the worker only if we can connect to pm2
    new Worker(conf).start();
  });
});

/**
 * Constructor of our worker
 *
 * @param {object} opts The options
 * @returns {Worker} The instance of our worker
 * @constructor
 */
var Worker = function (opts) {
  if (!(this instanceof Worker)) {
    return new Worker(opts);
  }

  this.opts = opts;
  this.port = this.opts.port || 8888;
  this.apps = opts.apps;

  if (typeof (this.apps) !== 'object') {
    this.apps = JSON.parse(this.apps);
  }

  this.server = http.createServer(this._handleHttp.bind(this));
  return this;
};

/**
 * Main function for http server
 *
 * @param req The Request
 * @param res The Response
 * @private
 */
Worker.prototype._handleHttp = function (req, res) {
  var self = this;

  // send instant answer since its useless to respond to the webhook
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('OK');

  // do something only with post request
  if (req.method !== 'POST') {
    res.end();
    return;
  }

  // get source ip
  req.ip = req.headers['x-forwarded-for'] || (req.connection ? req.connection.remoteAddress : false) ||
            (req.socket ? req.socket.remoteAddress : false) || ((req.connection && req.connection.socket)
              ? req.connection.socket.remoteAddress : false) || '';
  if (req.ip.indexOf('::ffff:') !== -1) {
    req.ip = req.ip.replace('::ffff:', '');
  }

  // get the whole body before processing
  req.body = '';
  req.on('data', function (data) {
    req.body += data;
  }).on('end', function () {
    self.processRequest(req);
  });

  res.end();
};

let oldSpawns = {};

/**
 * Main function of the module
 *
 * @param req The Request of the call
 */
Worker.prototype.processRequest = function (req) {
  var targetName = reqToAppName(req);
  if (targetName.length === 0) return;

  if (!oldSpawns[targetName]) oldSpawns[targetName] = {};

  var targetApp = this.apps[targetName];
  if (!targetApp) return;

  var error = this.checkRequest(targetApp, req);
  if (error) {
    console.log('[%s] App: %s\nError: %s', localeDateString(), targetName, JSON.stringify(error));
    return;
  }

  console.log('[%s] Received valid hook for app %s', localeDateString(), targetName);

  var execOptions = {
    cwd: targetApp.cwd,
    env: process.env,
	shell: true,
	stdio: ['ignore', process.stdout, process.stderr],
  };
  var phases = {
    resolveCWD: function resolveCWD(cb) {
      // if cwd is provided, we expect that it isnt a pm2 app
      if (targetApp.cwd) return cb();

      // try to get the cwd to execute it correctly
      pm2.describe(targetName, function (err, apps) {
        if (err || !apps || apps.length === 0) return cb(err || new Error('Application not found'));

        // execute the actual command in the cwd of the application
        targetApp.cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;
        return cb();
      });
    },
    pullTheApplication: function pullTheApplication(cb) {
      vizion.update({
        folder: targetApp.cwd
      }, logCallback(cb, '[%s] Successfuly pulled application %s', localeDateString(), targetName));
    },
    preHook: function preHook(cb) {
      if (!targetApp.prehook) return cb();

	  const oldChild = oldSpawns[targetName].prehook;
	  if (oldChild) logCallback(oldChild.kill, '[%s] Killed old prehook process as new request received %s', localeDateString(), targetName);
	  
	  const child = spawnAsExec(targetApp.prehook, execOptions, 
		logCallback(cb, '[%s] Prehook command has been successfuly executed for app %s', localeDateString(), targetName),
		function() { oldSpawns[targetName].prehook = undefined; });
		  
	  oldSpawns[targetName].prehook = child;
    },
    reloadApplication: function reloadApplication(cb) {
      if (targetApp.nopm2) return cb();

      pm2.gracefulReload(targetName,
	    logCallback(cb, '[%s] Successfuly reloaded application %s', localeDateString(), targetName));
    },
    postHook: function postHook(cb) {
      if (!targetApp.posthook) return cb();

      // execute the actual command in the cwd of the application
      spawnAsExec(targetApp.posthook, execOptions,
          logCallback(cb, '[%s] Posthook command has been successfuly executed for app %s', localeDateString(), targetName));
    }
  };
  async.series(Object.keys(phases).map(function(k){ return phases[k]; }),
    function (err, results) {
      if (err) {
        console.log('[%s] An error has occuring while processing app %s', localeDateString(), targetName);
        console.error('[%s] App : %s\nError: %s', localeDateString(), targetName, JSON.stringify(err));
      }
    });
};

/**
 * Checks if a request is valid for an app.
 *
 * @param targetApp The app which the request has to be valid
 * @param req The request to analyze
 * @returns {string|true} True if success or the string of the error if not.
 */
Worker.prototype.checkRequest = function checkRequest(targetApp, req) {
  var targetName = reqToAppName(req);
  switch (targetApp.service) {
    case 'gitlab': {
      if (!req.headers['x-gitlab-token']) {
        return util.format('[%s] Received invalid request for app %s (no headers found)', localeDateString(), targetName);
      }

      if (req.headers['x-gitlab-token'] !== targetApp.secret) {
        return util.format('[%s] Received invalid request for app %s (not matching secret)', localeDateString(), targetName);
      }
      break;
    }
    case 'jenkins': {
      // ip must match the secret
      if (req.ip.indexOf(targetApp.secret) < 0) {
        return util.format('[%s] Received request from %s for app %s but ip configured was %s', localeDateString(), req.ip, targetName, targetApp.secret);
      }

      var body = JSON.parse(req.body);
      if (body.build.status !== 'SUCCESS') {
        return util.format('[%s] Received valid hook but with failure build for app %s', localeDateString(), targetName);
      }
      if (targetApp.branch && body.build.scm.branch.indexOf(targetApp.branch) < 0) {
        return util.format('[%s] Received valid hook but with a branch %s than configured for app %s', localeDateString(), body.build.scm.branch, targetName);
      }
      break;
    }
    case 'droneci': {
      // Authorization header must match configured secret
      if (!req.headers['Authorization']) {
        return util.format('[%s] Received invalid request for app %s (no headers found)', localeDateString(), targetName);
      }
      if (req.headers['Authorization'] !== targetApp.secret) {
        return util.format('[%s] Received request from %s for app %s but incorrect secret', localeDateString(), req.ip, targetName);
      }

      var data = JSON.parse(req.body);
      if (data.build.status !== 'SUCCESS') {
        return util.format('[%s] Received valid hook but with failure build for app %s', localeDateString(), targetName);
      }
      if (targetApp.branch && data.build.branch.indexOf(targetApp.branch) < 0) {
        return util.format('[%s] Received valid hook but with a branch %s than configured for app %s', localeDateString(), data.build.branch, targetName);
      }
      break;
    }
    case 'bitbucket': {
      var tmp = JSON.parse(req.body);
      var ip = targetApp.secret || '104.192.143.0/24';
      var configured = ipaddr.parseCIDR(ip);
      var source = ipaddr.parse(req.ip);

      if (!source.match(configured)) {
        return util.format('[%s] Received request from %s for app %s but ip configured was %s', localeDateString(), req.ip, targetName, ip);
      }
      if (!tmp.push) {
        return util.format("[%s] Received valid hook but without 'push' data for app %s", localeDateString(), targetName);
      }
      if (targetApp.branch && tmp.push.changes[0] && tmp.push.changes[0].new.name.indexOf(targetApp.branch) < 0) {
        return util.format('[%s] Received valid hook but with a branch %s than configured for app %s', localeDateString(), tmp.push.changes[0].new.name, targetName);
      }
      break;
    }
    case 'github' :
    default: {
      if (!req.headers['x-github-event'] || !req.headers['x-hub-signature']) {
        return util.format('[%s] Received invalid request for app %s (no headers found)', localeDateString(), targetName);
      }

      // compute hash of body with secret, github should send this to verify authenticity
      var temp = crypto.createHmac('sha1', targetApp.secret);
      temp.update(req.body, 'utf-8');
      var hash = temp.digest('hex');

      if ('sha1=' + hash !== req.headers['x-hub-signature']) {
        return util.format('[%s] Received invalid request for app %s', localeDateString(), targetName);
      }
      break;
    }
  }
  return false;
};

/**
 * Lets start our server
 */
Worker.prototype.start = function () {
  var self = this;
  this.server.listen(this.opts.port, function () {
    console.log('[%s] Server is ready and listen on port %s', localeDateString(), self.port);
  });
};

/**
 * Executes the callback, but in case of success shows a message.
 * Also accepts extra arguments to pass to console.log.
 *
 * Example:
 * logCallback(next, '% worked perfect', appName)
 *
 * @param {Function} cb The callback to be called
 * @param {string} message The message to show if success
 * @returns {Function} The callback wrapped
 */
function logCallback(cb, message) {
  var wrappedArgs = Array.prototype.slice.call(arguments);
  return function (err, data) {
    if (err) return cb(err);

    wrappedArgs.shift();
    console.log.apply(console, wrappedArgs);
    cb();
  }
}

/**
 * Given a request, returns the name of the target App.
 *
 * Example:
 * Call to 34.23.34.54:3000/api-2
 * Will return 'api-2'
 *
 * @param req The request to be analysed
 * @returns {string|null} The name of the app, or null if not found.
 */
function reqToAppName(req) {
  var targetName = null;
  try {
    targetName = req.url.split('/').pop();
  } catch (e) {}
  return targetName || null;
}

/**
 * Wraps the node spawn function to work as exec (line, options, callback).
 * This avoid the maxBuffer issue, as no buffer will be stored.
 *
 * @param {string} command The line to execute
 * @param {object} options The options to pass to spawn
 * @param {function} cb The callback, called with error as first argument
 */
function spawnAsExec(command, options, cb, deleteOldSpawn = function () {}) {
  var child = spawn('eval', [command], options);
  child.on('close', function () {
	  deleteOldSpawn();
	  cb();
  });
  return child;
}

function pad(str) {
	str = str.toString();
	if (str.length >= 2) return str.substr(0, 2);
	str = '0' + str;
	return str;
}

function timezoneOffset(offset) {
	const sign = offset < 0 ? '+' : '-';
	offset = Math.abs(offset);
	const hours = Math.floor(offset/60);
	const mins = offset - (60 * hours);
	return `${sign}${pad(hours)}:${pad(mins)}`;
}

/**
 * Returns current time in local timezone in format : DD-MM-YYYY HH:mm:ss:SS Z
 */
function localeDateString() {
	const d = new Date();
	return `${pad(d.getDate())}-${pad(d.getMonth())}-${d.getFullYear()} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds())} `+
		`${timezoneOffset(d.getTimezoneOffset())}`;
}

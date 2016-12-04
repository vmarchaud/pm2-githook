/**
 * Copyright 2016 vmarchaud. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

var http    = require('http');
var crypto  = require('crypto');
var pmx     = require('pmx');
var pm2     = require('pm2');
var exec    = require('child_process').exec;
var async   = require('async');
var vizion  = require('vizion');
var ipcheck = require('range_check');

// init pmx module
pmx.initModule({}, function (err, conf) {
  pm2.connect(function (err) {
    if (err) {
      console.error(err);
      return process.exit(1);
    }
    // init the worker only if we can connect to pm2
    new Worker(conf).start();
  });
})

var Worker = function (opts) {
  if (!(this instanceof Worker)) {
    return new Worker(opts);
  }

  this.opts = opts;
  this.port = this.opts.port || 8888;
  this.apps = opts.apps;

  if (typeof(this.apps) !== 'object')
    this.apps = JSON.parse(this.apps);

  this.server = http.createServer(this._handleHttp.bind(this));
  return this;
}

Worker.prototype._handleHttp = function (req, res) {
  var self = this;

  // send instant answer since its useless to respond to the webhook
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('OK');
  res.end();

  // do something only with post request
  if (req.method !== 'POST') return;

  // get source ip
  req.ip = req.headers['x-forwarded-for'] || (req.connection ? req.connection.remoteAddress : false) ||
            (req.socket ? req.socket.remoteAddress : false) || ((req.connection && req.connection.socket) ? 
              req.connection.socket.remoteAddress : false) || '';

  // get the whole body before processing
  req.body = '';
  req.on('data', function (data) {
    req.body += data;
  }).on('end', function () {
    self.processRequest(req);
  });
}

Worker.prototype.processRequest = function (req) {
  var target_name = req.url.split('/').pop();
  if (target_name.length === 0) return;

  var target_app = this.apps[target_name];
  if (!target_app) return;

  // validate the request
  switch (target_app.service) {
    case 'gitlab': {
      if (!req.headers['x-gitlab-token']) 
        return console.log("[%s] Received invalid request for app %s (no headers found)", new Date().toISOString(), target_name);

      if (req.headers['x-gitlab-token'] !== target_app.secret)
        return console.log("[%s] Received invalid request for app %s (not matching secret)", new Date().toISOString(), target_name);
      break ;
    }
    case 'jenkins': {
      // ip must match the secret
      if (ipcheck.inRange(req.ip, target_app.secret)) return 

      var body = JSON.parse(req.body);
      if (body.build.status !== "SUCCESS")
        return console.log("[%s] Received valid hook but with failure build for app %s", new Date().toISOString(), target_name);
      if (target_app.branch && body.build.scm.branch.indexOf(target_app.branch) < 0)
        return console.log("[%s] Received valid hook but with a branch %s than configured for app %s", new Date().toISOString(), body.build.scm.branch, target_name);
      break ;
    }
    case 'bitbucket': {
      var body = JSON.parse(req.body);
      if (ipcheck.inRange(req.ip, target_app.secret || '104.192.143.0/24')) return 

      if (!body.push)
        return console.log("[%s] Received valid hook but without 'push' object for app %s", new Date().toISOString(), target_name);
      if (target_app.branch &&  body.push.changes[0] && body.push.changes[0].new.name.indexOf(target_app.branch) < 0)
        return console.log("[%s] Received valid hook but with a branch %s than configured for app %s", new Date().toISOString(), body.push.changes[0].new.name, target_name);
      break ;
    }
    case 'github' : 
    default: {
      if (!req.headers['x-github-event'] || !req.headers['x-hub-signature']) 
        return console.log("[%s] Received invalid request for app %s (no headers found)", new Date().toISOString(), target_name);

      // compute hash of body with secret, github should send this to verify authenticity
      var temp = crypto.createHmac('sha1', target_app.secret);
      temp.update(req.body, 'utf-8');
      var hash = temp.digest('hex');

      if ('sha1=' + hash !== req.headers['x-hub-signature'])
        return console.log("[%s] Received invalid request for app %s", new Date().toISOString(), target_name);
      break ;
    }
  }

  console.log("[%s] Received valid hook for app %s", new Date().toISOString(), target_name);

  async.series([
    // resolving cwd
    function (callback) {
      // if cwd is provided, we expect that it isnt a pm2 app
      if (target_app.cwd) return callback();

      // try to get the cwd to execute it correctly
      pm2.describe(target_name, function (err, apps) {
        if (err || !apps || apps.length === 0) return callback(err || new Error('Application not found'));

        // execute the actual command in the cwd of the application
        target_app.cwd = apps[0].pm_cwd ? apps[0].pm_cwd : apps[0].pm2_env.pm_cwd;
        return callback();
      });
    },
    // Pull the application
    function (callback) {
       vizion.update({
        folder: target_app.cwd
      }, function (err, meta) {
        if (err) return callback(err);
        console.log("[%s] Successfuly pulled application %s", new Date().toISOString(), target_name);
        return callback();
      });
    },
    // Pre-hook
    function (callback) {
      if (!target_app.prehook) return callback();

      exec(target_app.prehook, { cwd: target_app.cwd }, function (err, stdout, stderr) {
        if (err) return callback(err);

        console.log('[%s] Pre-hook command has been successfuly executed for app %s', new Date().toISOString(), target_name);
        return callback();
      })
    },
    // Reload the application
    function (callback) {
      // if no pm2 is provided, we don't reload
      if (target_app.nopm2) return callback();

      pm2.gracefulReload(target_name, function (err, data) {
        if (err) return callback(err);
        console.log("[%s] Successfuly reloaded application %s", new Date().toISOString(), target_name);
        return callback();
      })
    },
    // Post-hook
    function (callback) {
      if (!target_app.posthook) return callback();

      // execute the actual command in the cwd of the application
      exec(target_app.posthook, { cwd: target_app.cwd }, function (err, stdout, stderr) {
        if (err) return callback(err);

        console.log('[%s] Posthook command has been successfuly executed for app %s', new Date().toISOString(), target_name);
        return callback();
      })
    }
  ], function (err, results) {
    if (err) {
      console.log('[%s] An error has occuring while processing app %s', new Date().toISOString(), target_name);
      console.error(err);
    }
  })
}

//Lets start our server
Worker.prototype.start = function () {
  var self = this;
  this.server.listen(this.opts.port, function () {
    console.log("Server is ready and listen on port %s", self.opts.port);
  });
}

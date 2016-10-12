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

  // get the whole body before processing
  req.body = '';
  req.on('data', function (data) {
    req.body += data;
  }).on('end', function () {
    self.processRequest(req);
  });
}

Worker.prototype.processRequest = function (req) {
  // big security protection here, the legend says that yahoo use these kind.
  if (!req.headers['x-github-event']) return;
  if (!req.headers['x-hub-signature']) return;

  var target_name = req.url.split('/').pop();
  if (target_name.length === 0) return;

  var target_app = this.apps[target_name];
  if (!target_app) return;

  // compute hash of body with secret, github should send this to verify authenticity
  var temp = crypto.createHmac('sha1', target_app.secret);
  temp.update(req.body, 'utf-8');
  var hash = temp.digest('hex');

  if ('sha1=' + hash !== req.headers['x-hub-signature']) 
    return console.log("[%s] Received invalid request for app %s", new Date().toISOString(), target_name);

  console.log("[%s] Received valid hook for app %s", new Date().toISOString(), target_name);

  async.series([
    // Pre-hook
    function (callback) {
      if (!target_app.prehook) return callback(null);

      // try to get the cwd to execute it correctly
      pm2.describe(target_name, function (err, process) {
        if (err || !process || process.length === 0) return callback(err || new Error('Application not found'));

        // execute the actual command in the cwd of the application
        exec(target_app.prehook, { cwd: process[0].pm2_env.cwd }, function (err, stdout, stderr) {
          if (err || !process || process.length === 0) return callback(err);

          console.log('[%s] Pre-hook command has been successfuly executed for app %s', new Date().toISOString(), target_name);
          return callback(null);
        })
      })
    },
    function (callback) {
      pm2.pullAndGracefulReload(target_name, function (err, data) {
        if (err) return callback(err);
        console.log("[%s] Successfuly pull and reloaded application %s", new Date().toISOString(), target_name);
      })
    },
    // Post-hook
    function (callback) {
      if (!target_app.posthook) return callback(null);

      // try to get the cwd to execute it correctly
      pm2.describe(target_name, function (err, process) {
        if (err || !process || process.length === 0) return callback(err || new Error('Application not found'));

        // execute the actual command in the cwd of the application
        exec(target_app.posthook, { cwd: process[0].pm2_env.cwd }, function (err, stdout, stderr) {
          if (err || !process || process.length === 0) return callback(err);

          console.log('[%s] Posthook command has been successfuly executed for app %s', new Date().toISOString(), target_name);
          return callback(null);
        })
      })
    }
  ], function (err, results) {
    if (err) {
      console.log('[%s] An error has occuring while processing app %s', new Date().toISOString(), target_name);
      console.log(err);
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

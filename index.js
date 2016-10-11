/**
 * Copyright 2016 vmarchaud. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

var http    = require('http');
var crypto  = require('crypto');
var pmx     = require('pmx');
var pm2     = require('pm2');

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

  var target_app = req.url.split('/').pop();
  if (target_app.length === 0) return;

  // compute hash of body with secret, github should send this to verify authenticity
  var temp = crypto.createHmac('sha1', this.apps[target_app]);
  temp.update(req.body, 'utf-8');
  var hash = temp.digest('hex');

  if (hash !== req.headers['x-hub-signature']) 
    return console.log("Received invalid request for app %s", target_app);

  console.log("Received valid request to pull and reload %s", target_app);
  pm2.pullAndGracefulReload(target_app, function (err, data) {
    if (err) return console.error(err);
    console.log("Successfuly pull and reloaded application %s", target_app);
  })
}

//Lets start our server
Worker.prototype.start = function () {
  var self = this;
  this.server.listen(this.opts.port, function () {
    console.log("Server is ready and listen on port %s", self.opts.port);
  });
}

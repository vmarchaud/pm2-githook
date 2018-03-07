/**
 * Copyright 2018 vmarchaud, rohit-smpx. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

const pmx = require('pmx');
const pm2 = require('pm2');

const Worker = require('./lib/Worker');
const slack = require('./lib/slack');
const logger = require('./lib/logger');
const {localeDateString} = require('./lib/helpers');


/**
 * Init pmx module
 */
pmx.initModule({}, (err, conf) => {
	logger.init(conf.logsDir);
	slack.init(conf.slack);

	pm2.connect((err2) => {
		if (err || err2) {
			logger.error('[%s] Error: %s', localeDateString(), JSON.stringify(err || err2));
			process.exit(1);
			return;
		}
		// init the worker only if we can connect to pm2
		new Worker(conf).start();
	});
});


const util = require('util');
const rfs = require('rotating-file-stream');

let logStream;

function initLogStream(logDir = '/smartprix/logs/server_logs/pm2') {
	if (!logStream) {
		logStream = rfs('pm2-githook2.log', {
			interval: '1d',
			maxFiles: 10,
			path: logDir,
		});
	}
	return logStream;
}

module.exports = {
	log(...args) {
		console.log(...args);
		logStream.write(util.format(...args));
	},

	error(...args) {
		console.error(...args);
		logStream.write(util.format(...args));
	},

	write(...args) {
		logStream.write(util.format(...args));
	},

	init: initLogStream,
};

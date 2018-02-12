const spawn = require('child_process').spawn;
const rfs = require('rotating-file-stream');

const logStream = rfs('githookHooks.log', {
	interval: '1d',
	maxFiles: 10,
	path: '/smartprix/logs/server_logs/pm2',
});

function pad(str) {
	str = str.toString();
	if (str.length >= 2) return str.substr(0, 2);
	str = '0' + str;
	return str;
}

function timezoneOffset(offset) {
	const sign = offset < 0 ? '+' : '-';
	offset = Math.abs(offset);
	const hours = Math.floor(offset / 60);
	const mins = offset - (60 * hours);
	return `${sign}${pad(hours)}:${pad(mins)}`;
}

/**
 * Returns current time in local timezone in format : DD-MM-YYYY HH:mm:ss:SS Z
 */
function localeDateString() {
	const d = new Date();
	return `${pad(d.getDate())}-${pad(d.getMonth())}-${d.getFullYear()} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds())} ` +
		`${timezoneOffset(d.getTimezoneOffset())}`;
}


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
function logCallback(cb, ...args) {
	const wrappedArgs = Array.prototype.slice.call(args);
	return function (err) {
		if (err) return cb(err);

		wrappedArgs.shift();
		console.log(...wrappedArgs);
		return cb();
	};
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
	let targetName = null;
	try {
		targetName = req.url.split('/').pop();
	}
	catch (e) { console.error(e) }
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
	const child = spawn('eval', [command], options);

	child.on('close', () => {
		deleteOldSpawn();
		cb();
	});

	child.stderr.on('data', (data) => {
		console.error('[%s] Hook command error : %s', localeDateString(), data.toString());
	});

	child.stdout.on('data', (data) => {
		logStream.write(`[${localeDateString()}] Hook command log : ${data.toString()}`);
	});

	return child;
}


module.exports = {
	localeDateString,
	logCallback,
	reqToAppName,
	spawnAsExec,
};

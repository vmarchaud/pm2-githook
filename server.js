const path = require('path');
const url = require('url');
const fse = require('fs-extra');

const {logger} = require('./helpers');

/**
 * Main function for http server
 *
 * @param req The Request
 * @param res The Response
 * @private
 */
module.exports = (req, res) => {
	const self = this;

	// get request => serve test report if exists
	if (req.method === 'GET') {
		const parsedUrl = url.parse(req.url);
		const appNames = Object.keys(this.apps);

		let urlPath = parsedUrl.path;
		const appIndex = appNames.indexOf(urlPath.split('/')[1]);
		console.log(appNames);
		console.log(urlPath.split('/'));

		const commitHash = this.apps[appNames[appIndex]].tests.lastGoodCommit;
		if (appIndex !== -1 && urlPath.split('/').length <= 2 && commitHash !== '') {
			urlPath = `${commitHash}/${appNames[appIndex]}.html`;
		}
		logger.log(urlPath);

		let pathname = `${this.opts.logsDir}/${urlPath}`;
		const ext = path.parse(pathname).ext;
		const map = {
			'.ico': 'image/x-icon',
			'.html': 'text/html',
			'.js': 'text/javascript',
			'.json': 'application/json',
			'.css': 'text/css',
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
		};

		fse.exists(pathname, (exist) => {
			if (!exist) {
				// if the file is not found, return 404
				res.statusCode = 404;
				res.end(`File ${pathname} not found!`);
				return;
			}

			// if is a directory search for index file matching the extention
			if (fse.statSync(pathname).isDirectory()) pathname += '/index' + ext;

			// read file from file system
			fse.readFile(pathname, (err, data) => {
				if (err) {
					res.statusCode = 500;
					res.end(`Error getting the file: ${err}.`);
				}
				else {
					// if the file is found, set Content-type and send data
					res.setHeader('Content-type', map[ext] || 'text/plain');
					res.end(data);
				}
			});
		});
	}
	// post request => webhook
	else if (req.method === 'POST') {
		// send instant answer since its useless to respond to the webhook
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.write('OK');

		// get source ip
		req.ip = req.headers['x-forwarded-for'] ||
			(req.connection ? req.connection.remoteAddress : false) ||
			(req.socket ? req.socket.remoteAddress : false) ||
			((req.connection && req.connection.socket) ? req.connection.socket.remoteAddress : false) || '';

		if (req.ip.indexOf('::ffff:') !== -1) {
			req.ip = req.ip.replace('::ffff:', '');
		}

		// get the whole body before processing
		req.body = '';
		req.on('data', (data) => {
			req.body += data;
		}).on('end', () => {
			self.processRequest(req);
		});
	}
	else {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.write('N/A');
	}
	res.end();
};

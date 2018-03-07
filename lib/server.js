const path = require('path');
const url = require('url');
const fse = require('fs-extra');

const logger = require('./logger');

/**
 * Main function for http server
 *
 * @param req The Request
 * @param res The Response
 * @private
 */
module.exports = function (req, res) {
	// get request => serve test report if exists
	if (req.method === 'GET') {
		const parsedUrl = url.parse(req.url);
		const urlPath = parsedUrl.path;
		let appName;
		let commit;

		// matches /APP_NAME/COMMIT_HASH
		if (/\/.+\/.+\/?/.test(urlPath)) {
			appName = urlPath.split('/')[1];
			commit = urlPath.split('/')[2];
		}
		// matches '/APP_NAME/'
		else if (/\/.+\/?/.test(urlPath)) {
			appName = urlPath.split('/')[1];
			const appConf = this.apps[appName];
			commit = appConf && appConf.tests.lastGoodCommit;
			if (!(appConf && commit)) {
				res.statusCode = 404;
				if (appConf) res.end('No test reports exist for this app');
				else res.end('No such app');
				return;
			}
		}

		let filePath = `${this.opts.logsDir}/test-reports/`;
		if (appName && commit) {
			filePath += `${appName}/${commit}/${appName}.html`;
			logger.log(`Serving test report for commit ${commit} of ${appName}`);
		}
		else filePath += urlPath;

		const ext = path.parse(filePath).ext;
		const map = {
			'.ico': 'image/x-icon',
			'.html': 'text/html',
			'.js': 'text/javascript',
			'.json': 'application/json',
			'.css': 'text/css',
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
		};

		fse.exists(filePath, (exist) => {
			if (!exist) {
				// if the file is not found, return 404
				res.statusCode = 404;
				res.end(`File ${filePath} not found!`);
				return;
			}

			// read file from file system
			fse.readFile(filePath, (err, data) => {
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
			this.processRequest(req);
		});
		res.end();
	}
	else {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('N/A');
	}
};

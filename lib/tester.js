const tmp = require('tmp');
const Git = require('nodegit');
const fse = require('fs-extra');
const promisify = require('util').promisify;
const exec = promisify(require('child_process').exec);

const logger = require('./logger');
const slack = require('./slack');

async function testRunner({git, app, reportDir}) {
	const gitOpts = {
		checkoutBranch: git.branch,
		fetchOpts: {
			callbacks: {
				credentials(url, userName) {
					return Git.Cred.sshKeyFromAgent(userName);
				},
				certificateCheck() {
					return 1;
				},
			},
		},
	};
	const res = {};
	let tests = {code: 2};
	await new Promise((resolve) => {
		tmp.dir({unsafeCleanup: true}, async (err, path, cleanupCb) => {
			const repo = await Git.Clone(git.url, path, gitOpts);
			const head = (await repo.getHeadCommit()).toString();
			const reportPath = `${path}/${app.tests.reportPath}.json`;

			// Run tests
			try {
				tests = await exec(`${app.prehook}; ${app.tests.testCmd}`, {cwd: path});
				logger.log(`Successfully ran test command, ${app.tests.testCmd}, for app`);
			}
			catch (error) { tests = error }

			// eslint-disable-next-line
			const report = require(reportPath).stats;

			// copy report folder to logs dir
			try {
				await fse.copy(path + '/' + app.tests.reportPath.split('/')[0],
					reportDir + '/' + head, {overwrite: true});
				logger.log(`Copied report for commit ${head} of app to ${reportDir}`);
			}
			catch (e) {
				console.error(e);
			}
			// Error encountered
			if (tests.code) {
				//
				logger.log('Tests Failed');
				res.commit = app.tests.lastGoodCommit;
				res.pass = false;
			}
			// No Errors
			else {
				logger.log('Tests Passed');
				res.commit = head;
				res.pass = true;
			}
			cleanupCb();
			resolve();
		});
	});
	slack.send('success');
	return res;
}

module.exports = testRunner;

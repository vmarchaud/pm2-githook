const tmp = require('tmp');
const Git = require('nodegit');
const fse = require('fs-extra');
const promisify = require('util').promisify;
const exec = promisify(require('child_process').exec);
const logger = require('./logger');
const slack = require('./slack');

const options = {
	testCmd: 'export PATH=$PATH:usr/bin/git && npm run setup > /dev/null 2>/dev/null && npm run test-report > /dev/null',
	reportPath: 'testReport/sm-crawler',
	lastGoodCommit: 'acbaf70c4f1ae5012d39bb9e971d2af56f8108f5',
};

async function testRunner({app}) {
	const gitOpts = {
		checkoutBranch: options.branch,
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
	logger.log(app);

	tmp.dir({unsafeCleanup: true}, async (err, path, cleanupCb) => {
		let tests = {code: 2};
		let report;
		const repo = await Git.Clone(options.repo, path, gitOpts);
		const reportPath = `${path}/${options.reportPath}.json`;

		// Run tests
		try { tests = await exec(options.testCmd, {cwd: path}) }
		catch (error) { tests = error }

		// eslint-disable-next-line
		report = require(reportPath).stats;
		logger.log(report.stats);

		// copy report folder to logs dir
		const reportDir = path + '/' + options.reportPath.split('/')[0];
		const head = await repo.getHeadCommit();
		await fse.copy(reportDir, options.reportsDir + '/' + head);
		cleanupCb();

		// Error encountered
		if (tests.code) {
			//
			return options.lastGoodCommit;
		}
		// No Errors
		slack.send('success');
		return head;
	});
}

module.exports = testRunner;

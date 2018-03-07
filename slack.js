const Webhook = require('@slack/client').IncomingWebhook;
const {logger} = require('./helpers');

let slack;
const options = {};

module.exports = {
	init: ({webhook, channel}) => {
		slack = new Webhook(webhook);
		options.channel = channel;
	},
	send: (msgs, title, errs) => {
		if (!slack) {
			console.error('Slack Webhook not set');
			return;
		}

		const payload = {
			username: 'githook-bot',
			icon_emoji: ':bar_chart:',
			channel: options.channel,
			attachments: [],
		};
		if (errs.length !== 0) {
			payload.attachments.push({
				pretext: title,
				color: 'danger',
				fallback: 'Tests Failed\n',
				fields: errs,
			});
			title = undefined;
		}
		payload.attachments.push({
			pretext: title,
			color: 'good',
			fallback: 'Tests Passed\n',
			fields: msgs,
		});
		slack.send(payload, (error, header, statusCode) => {
			if (error) {
				logger.error(error);
				return;
			}
			logger.log('Sent slack msg. Received', statusCode, 'from Slack.\n');
		});
	},
};

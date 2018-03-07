const Webhook = require('@slack/client').IncomingWebhook;
const logger = require('./logger');

let slack;
const options = {};

module.exports = {
	init: ({webhook, channel}) => {
		slack = new Webhook(webhook);
		options.channel = channel;
	},
	send: (title, msgs = [], errs = []) => {
		if (!slack || !options.channel) {
			console.error('Slack Webhook not set');
			return;
		}

		const payload = {
			username: 'Githook-Bot',
			icon_emoji: ':bar_chart:',
			channel: options.channel,
			attachments: [],
		};
		if (errs.length !== 0) {
			payload.attachments.push({
				pretext: title,
				color: 'danger',
				fallback: title,
				fields: errs,
			});
			title = undefined;
		}
		payload.attachments.push({
			pretext: title,
			color: 'good',
			fallback: title,
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

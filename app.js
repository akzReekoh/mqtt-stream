'use strict';

var platform = require('./platform'),
	uuid     = require('uuid'),
	mqttClient;

platform.once('close', function () {
	let d = require('domain').create();

	d.once('error', function (error) {
		console.error(error);
		platform.handleException(error);
		platform.notifyClose();
		d.exit();
	});

	d.run(function () {
		mqttClient.end();
		platform.notifyClose();
		d.exit();
	});
});

platform.once('ready', function (options) {
	console.log(options);

	let mqtt             = require('mqtt'),
		isEmpty          = require('lodash.isempty'),
		async            = require('async'),
		get              = require('lodash.get'),
		connectionParams = {};

	if (options.host.endsWith('/'))
		options.host = options.host.slice(0, -1);

	if (!isEmpty(options.username) && !isEmpty(options.password)) {
		connectionParams.username = options.username;
		connectionParams.password = options.password;
	}

	if (options.reschedule_pings === false)
		connectionParams.reschedulePings = false;

	if (options.queue_qos_zero === false)
		connectionParams.queueQoSZero = false;

	if (options.client_id)
		connectionParams.clientId = options.client_id;

	if (!isEmpty(options.will_topic)) {
		connectionParams.will = {
			topic: options.will_topic,
			payload: options.will_payload || '',
			qos: (options.will_qos === 0) ? 0 : options.will_qos || 0,
			retain: (options.will_retain !== false)
		};
	}

	if (options.protocol_version === '3.1') {
		connectionParams.protocolId = 'MQIsdp';
		connectionParams.protocolVersion = 3;
	}
	else {
		connectionParams.protocolId = 'MQTT';
		connectionParams.protocolVersion = 4;
	}

  if (isEmpty(options.client_id))
    connectionParams.clientId = uuid.v4();
  else
    connectionParams.clientId = options.client_id;

	mqttClient = mqtt.connect(`${options.protocol || 'mqtt'}://${options.host}:${options.port}`, connectionParams);

	mqttClient.on('message', (topic, payload) => {
		payload = payload.toString();
		console.log(payload)

		async.waterfall([
			async.constant(payload || '{}'),
			async.asyncify(JSON.parse)
		], (error, data) => {
			if (error || isEmpty(data)) {
				return platform.handleException(new Error(`Invalid data. Data must be a valid JSON String. Raw Message: ${payload}`));
			}

			let processData = function (sensorData, cb) {
				let deviceId = get(sensorData, options.device_key || 'device');

				if (isEmpty(deviceId)) {
					platform.handleException(new Error(`Device ID should be supplied. Data should have a ${options.device_key} property/key. Data: ${sensorData}`));
					return cb();
				}

				platform.requestDeviceInfo(deviceId, function (error, requestId) {
					platform.once(requestId, function (deviceInfo) {
						if (deviceInfo) {
							delete sensorData[options.device_key || 'device'];

							platform.processData(deviceId, JSON.stringify(Object.assign(sensorData, {
								device: deviceId
							})));

							platform.log(JSON.stringify({
								title: 'MQTT Stream - Data Received',
								device: sensorData.device,
								data: sensorData
							}));
						}
						else
							platform.handleException(new Error(`Device ${sensorData.device} not registered`));
					});
				});

				cb();
			};

			if (Array.isArray(data)) {
				async.each(data, function (sensorData, cb) {
					processData(sensorData, cb);
				});
			}
			else
				processData(data);
		});
	});
	
	mqttClient.once('connect', () => {
		console.log('Connected')
		mqttClient.subscribe(options.topic);

		platform.notifyReady();
		platform.log('MQTT Stream has been initialized.');
	});
});
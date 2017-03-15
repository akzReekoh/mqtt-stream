'use strict';

var platform = require('./platform'),
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
    let mqtt = require('mqtt'),
        isEmpty = require('lodash.isempty'),
        async = require('async'),
        get = require('lodash.get'),
        connectionParams = {};

    if(options.host.endsWith('/'))
        options.host = options.host.slice(0, -1);

    connectionParams.host = options.host;
    connectionParams.port = options.port;

    if(!isEmpty(options.username) && !isEmpty(options.password)){
        connectionParams.username = options.username;
        connectionParams.password = options.password;
    }

    mqttClient = mqtt.connect(connectionParams);

    mqttClient.on('message', (topic, payload) => {
        payload = payload.toString();

        async.waterfall([
            async.constant(payload || '{}'),
            async.asyncify(JSON.parse)
        ], (error, data) => {
            if (error || isEmpty(data)) {
                return platform.handleException(new Error(`Invalid data. Data must be a valid JSON String. Raw Message: ${payload}`));
            }

            let processData = function (sensorData, cb) {
				let deviceId = get(sensorData, options.device_key || 'device');

				if(isEmpty(deviceId)) {
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

    mqttClient.on('connect', () => {
        mqttClient.subscribe(options.topic);

        platform.notifyReady();
        platform.log('MQTT Stream has been initialized.');
    });
});
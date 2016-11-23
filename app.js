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
        console.log(topic, payload);
        platform.processData(topic, payload);
    });

    mqttClient.on('connect', () => {
        mqttClient.subscribe(options.topic);

        platform.notifyReady();
        platform.log('MQTT Stream has been initialized.');
    });
});
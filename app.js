'use strict'

let reekoh = require('reekoh')
let _plugin = new reekoh.plugins.Stream()
let uuid = require('uuid')
let mqttClient = null

_plugin.once('ready', () => {
  let mqtt = require('mqtt')
  let isEmpty = require('lodash.isempty')
  let async = require('async')
  let get = require('lodash.get')
  let connectionParams = {}

  if (_plugin.config.host.endsWith('/')) _plugin.config.host = _plugin.config.host.slice(0, -1)

  if (!isEmpty(_plugin.config.username) && !isEmpty(_plugin.config.password)) {
    connectionParams.username = _plugin.config.username
    connectionParams.password = _plugin.config.password
  }

  if (_plugin.config.reschedulePings === false) connectionParams.reschedulePings = false

  if (_plugin.config.queueQosZero === false) connectionParams.queueQoSZero = false

  if (_plugin.config.clientId) connectionParams.clientId = _plugin.config.clientId

  if (!isEmpty(_plugin.config.willTopic)) {
    connectionParams.will = {
      topic: _plugin.config.willTopic,
      payload: _plugin.config.willPayload || '',
      qos: (_plugin.config.willQos === 0) ? 0 : _plugin.config.willQos || 0,
      retain: (_plugin.config.willRetain !== false)
    }
  }

  if (_plugin.config.protocolVersion === '3.1') {
    connectionParams.protocolId = 'MQTT'
    connectionParams.protocolVersion = 3

    if (isEmpty(connectionParams.clientId)) connectionParams.clientId = uuid.v4()
  } else {
    connectionParams.protocolId = 'MQIsdp'
    connectionParams.protocolVersion = 4
  }

  mqttClient = mqtt.connect(`${_plugin.config.protocol || 'mqtt'}://${_plugin.config.host}:${_plugin.config.port}`, connectionParams)

  mqttClient.on('message', (topic, payload) => {
    payload = payload.toString()

    async.waterfall([
      async.constant(payload || '{}'),
      async.asyncify(JSON.parse)
    ], (error, data) => {
      if (error || isEmpty(data)) {
        return _plugin.logException(new Error(`Invalid data. Data must be a valid JSON String. Raw Message: ${payload}`))
      }

      let processData = function (sensorData, cb) {
        let deviceId = get(sensorData, _plugin.config.deviceKey || 'device')

        if (isEmpty(deviceId)) {
          _plugin.logException(new Error(`Device ID should be supplied. Data should have a ${_plugin.config.deviceKey} property/key. Data: ${sensorData}`))
          return cb()
        }
        _plugin.requestDeviceInfo(deviceId)
          .then((deviceInfo) => {
            if (deviceInfo) {
              delete sensorData[_plugin.config.deviceKey || 'device']
              _plugin.pipe(deviceInfo, get(data, _plugin.config.sequenceKey))
                .then(() => {
                  _plugin.log(JSON.stringify({
                    title: 'MQTT Stream - Data Received',
                    device: sensorData.device,
                    data: sensorData
                  }))
                })
                .catch((error) => {
                  _plugin.logException(error)
                })
            } else _plugin.logException(new Error(`Device ${sensorData.device} not registered`))
          })
          .catch((error) => {
            _plugin.logException(error)
          })
        cb()
      }

      if (Array.isArray(data)) {
        async.each(data, function (sensorData, cb) {
          processData(sensorData, cb)
        }, (err) => {
          if (err) _plugin.logException(err)
        })
      } else {
        processData(data, (error) => {
          if (error) _plugin.logException(error)
        })
      }
    })
  })

  mqttClient.once('connect', () => {
    mqttClient.subscribe(_plugin.config.topic)

    _plugin.log('MQTT Stream has been initialized.')
    _plugin.emit('init')
  })
})

module.exports = _plugin

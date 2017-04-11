'use strict'

const PORT = 8086
const	HOST = 'localhost'
const TOPIC = 'message'
const Mosca = require('mosca')

const amqp = require('amqplib')

let _channel = null
let _conn = null
let app = null

describe('HCP MMS Connector Test', () => {
  before('init', () => {
    process.env.ACCOUNT = 'adinglasan'
    process.env.CONFIG = JSON.stringify({
      host: HOST,
      port: PORT,
      topic: TOPIC
    })
    process.env.OUTPUT_PIPES = 'op.mqtt1, op.mqtt2'
    process.env.PLUGIN_ID = 'mqtt.stream'
    process.env.COMMAND_RELAYS = 'cr1, cr2'
    process.env.LOGGERS = 'logger1, logger2'
    process.env.EXCEPTION_LOGGERS = 'ex.logger1, ex.logger2'
    process.env.BROKER = 'amqp://guest:guest@127.0.0.1/'

    amqp.connect(process.env.BROKER)
      .then((conn) => {
        _conn = conn
        return conn.createChannel()
      }).then((channel) => {
      _channel = channel
    }).catch((err) => {
      console.log(err)
    })
  })

  after('close connection', function (done) {
    _conn.close()
    done()
  })

  describe('#start', function () {
    it('should start the app', function (done) {
      this.timeout(10000)

      let server = new Mosca.Server({port: PORT})

      server.on('ready', () => {
        console.log('Server running')
        app = require('../app')

        server.on('clientConnected', (client) => {
          console.log('Client connected', client.id)
        })

        app.once('init', () => {
          setTimeout(() => {
            console.log('publishing')
            server.publish({
              topic: TOPIC,
              payload: JSON.stringify({device: 'device1', data: 'test data'})
            })
            console.log('published')
            done()
          }, 5000)
        })
      })
    })
  })
})

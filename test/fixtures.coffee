Promise = global.Promise ? require('es6-promise').Promise
{EventEmitter} = require 'events'
_              = require 'lodash'
sinon          = require 'sinon'

class exports.FakeAmqp
    constructor: ->
        @reset()

    kill: ->
        @connection.emit 'error', new Error("Died in a fire")

    reset: ->
        @connection = null
        @url = null
        @failConnections = false
        @deadServers = []
        @connect = sinon.spy (url) =>
            if @failConnections then return Promise.reject new Error('No')

            allowConnection = true
            @deadServers.forEach (deadUrl) -> if _.startsWith url, deadUrl then allowConnection = false
            if !allowConnection
                return Promise.reject new Error("Dead server #{url}")

            @connection = new exports.FakeConnection(url)
            Promise.resolve @connection

class exports.FakeConfirmChannel extends EventEmitter
    constructor: ->
        @publish = sinon.spy (exchage, routingKey, content, options, callback) =>
            @emit 'publish', content
            callback(null)
            return true

        @sendToQueue = sinon.spy (queue, content, options, callback) =>
            @emit 'sendToQueue', content
            callback(null)
            return true

        @ack = sinon.spy (message, allUpTo) ->

        @nack = sinon.spy (message, allUpTo, requeue) ->

        @close = sinon.spy => @emit 'close'

class exports.FakeConnection extends EventEmitter
    constructor: (@url) ->
        @_closed = false

    createConfirmChannel: ->
        Promise.resolve new exports.FakeConfirmChannel

    close: ->
        @_closed = true
        return Promise.resolve()

class exports.FakeAmqpConnectionManager extends EventEmitter
    constructor: ->
        @connected = false

    isConnected: -> @connected

    simulateConnect: ->
        url = 'amqp://localhost'
        @_currentConnection = new exports.FakeConnection url
        @connected = true
        @emit 'connect', {connection: @_currentConnection, url}

    simulateDisconnect: ->
        @_currentConnection = null
        @connected = false
        @emit 'disconnect', {err: new Error ('Boom!')}

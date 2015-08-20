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


class exports.FakeConnection extends EventEmitter
    constructor: (@url) ->

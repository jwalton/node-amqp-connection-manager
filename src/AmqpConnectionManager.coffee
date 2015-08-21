{EventEmitter} = require 'events'
amqp           = require 'amqplib'
urlUtils       = require 'url'
_              = require 'lodash'

ChannelWrapper = require './ChannelWrapper'
{wait}         = require './helpers'

# Default heartbeat time.
HEARTBEAT_IN_SECONDS = 5

#
# Events:
# * `connect({connection, url})` - Emitted whenever we connect to a broker.
# * `disconnect({err})` - Emitted whenever we disconnect from a broker.
#
class AmqpConnectionManager extends EventEmitter
    # Create a new AmqplibConnectionManager.
    #
    # * `urls` is an array of brokers to connect to.  AmqplibConnectionManager will round-robin between them
    #   whenever it needs to create a new connection.
    #
    constructor: (@urls, options={}) ->
        @_channels = []

        if !_.isArray @urls then @urls = [@urls]
        @_currentUrl = 0

        @heartbeatIntervalInSeconds = options.heartbeatIntervalInSeconds ? HEARTBEAT_IN_SECONDS

        # There will be one listener per channel, and there could be a lot of channels, so disable warnings from node.
        @setMaxListeners 0

        @_connect()

    # `options` here are any options that can be passed to ChannelWrapper.
    createChannel: (options={}) ->
        channel = new ChannelWrapper this, options
        @_channels.push channel
        channel.once 'close', =>
            @_channels = _.without @_channels, channel
        return channel

    close: ->
        @_closed = true

        @_channels.forEach (channel) -> channel.close()
        @_channels = []

    isConnected: -> return @_currentConnection?

    _connect: ->
        return Promise.resolve() if @_closed

        # Round robin between brokers
        if @_currentUrl >= @urls.length then @_currentUrl = 0
        url = @urls[@_currentUrl]
        @_currentUrl++

        amqpUrl = urlUtils.parse url
        if amqpUrl.search?
            amqpUrl.search += "&heartbeat=#{@heartbeatIntervalInSeconds}"
        else
            amqpUrl.search = "?heartbeat=#{@heartbeatIntervalInSeconds}"

        amqp.connect urlUtils.format(amqpUrl)
        .then (connection) =>
            @_currentConnection = connection

            # Reconnect if the broker goes away.
            connection.on 'error', (err) =>
                @_currentConnection = null
                @emit 'disconnect', {err}
                @_connect()
                .catch (err) ->
                    ### !pragma coverage-skip-block ###
                    # `_connect()` should never throw.
                    console.error "amqp-connection-manager: AmqpConnectionManager:_connect() - How did you get here?",
                        err.stack

            @emit 'connect', {connection, url}

        .catch (err) =>
            @emit 'disconnect', {err}

            # Connection failed...
            @_currentConnection = null

            # TODO: Probably want to try right away here, especially if there are multiple brokers to try...
            wait @heartbeatIntervalInSeconds * 1000
            .then => @_connect()

module.exports = AmqpConnectionManager

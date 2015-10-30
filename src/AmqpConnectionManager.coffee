{EventEmitter} = require 'events'
amqp           = require 'amqplib'
urlUtils       = require 'url'
_              = require 'lodash'

ChannelWrapper = require './ChannelWrapper'
{wait}         = require './helpers'
pb             = require 'promise-breaker'

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
    # * `options.heartbeatIntervalInSeconds` is the interval, in seconds, to send heartbeats.  Defaults to 5 seconds.
    # * `options.reconnectTimeInSeconds` is the time to wait before trying to reconnect.  If not specified,
    #   defaults to `heartbeatIntervalInSeconds`.
    # * `options.findServers(callback)` is a function which returns one or more servers to connect to.  This should
    #   return either a single URL or an array of URLs.  This is handy when you're using a service discovery mechanism
    #   such as Consul or etcd.  Instead of taking a `callback`, this can also return a Promise.  Note that if this
    #   is supplied, then `urls` is ignored.
    #
    constructor: (urls, options={}) ->
        if !urls and !options.findServers then throw new Error "Must supply either `urls` or `findServers`"
        @_channels = []

        @_currentUrl = 0

        @heartbeatIntervalInSeconds = options.heartbeatIntervalInSeconds ? HEARTBEAT_IN_SECONDS
        @reconnectTimeInSeconds = options.reconnectTimeInSeconds ? @heartbeatIntervalInSeconds

        # There will be one listener per channel, and there could be a lot of channels, so disable warnings from node.
        @setMaxListeners 0

        @_findServers = options.findServers ? (-> Promise.resolve urls)

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

        Promise.resolve()
        .then =>
            if !@_urls or (@_currentUrl >= @_urls.length)
                @_currentUrl = 0
                pb.callFn @_findServers, 0, null
            else
                @_urls

        .then (urls) =>
            if urls? and !_.isArray urls then urls = [urls]
            @_urls = urls

            if !urls or urls.length is 0 then throw new Error 'No servers found'

            # Round robin between brokers
            url = urls[@_currentUrl]
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

                return null

        .catch (err) =>
            console.log err
            @emit 'disconnect', {err}

            # Connection failed...
            @_currentConnection = null

            # TODO: Probably want to try right away here, especially if there are multiple brokers to try...
            wait @reconnectTimeInSeconds * 1000
            .then => @_connect()

module.exports = AmqpConnectionManager

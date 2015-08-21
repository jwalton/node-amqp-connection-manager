Promise = global.Promise ? require('es6-promise').Promise

{EventEmitter} = require 'events'
_              = require 'lodash'
pb             = require 'promise-breaker'

# Calls to `publish()` or `sendToQueue()` work just like in amqplib, but messages are queued internally and
# are guaranteed to be delivered.  If the underlying connection drops, ChannelWrapper will wait for a new
# connection and continue.
#
# Events:
# * `connect` - emitted every time this channel connects or reconnects.
# * `error(err, {name})` - emitted if an error occurs setting up the channel.
# * `drop({message, err})` - called when a JSON message was dropped because it could not be encoded.
# * `close` - emitted when this channel closes via a call to `close()`
#
class ChannelWrapper extends EventEmitter
    # Create a new ChannelWrapper.
    #
    # * `options.name` is a name for this channel.  Handy for debugging.
    # * `options.setup` is a default setup function to call.  See `addSetup` for details.
    # * `options.json` if true, then ChannelWrapper assumes all messages passed to `publish()` and `sendToQueue()`
    #   are plain JSON objects.  These will be encoded automatically before being sent.
    #
    constructor: (connectionManager, options={}) ->
        @_connectionManager = connectionManager
        @name = options.name

        @_json = options.json ? false

        # Place to store queued messages.
        @_messages = []

        # True if the "worker" is busy sending messages.  False if we need to start the worker to get stuff done.
        @_working = false

        # Array of setup functions to call.
        @_setups = []
        if options.setup? then @_setups.push options.setup

        if connectionManager.isConnected()
            @_onConnect {connection: @_connectionManager._currentConnection}
        connectionManager.on 'connect', @_onConnect
        connectionManager.on 'disconnect', @_onDisconnect

    # Called whenever we connect to the broker.
    _onConnect: ({connection}) =>
        @_connection = connection

        connection.createConfirmChannel()
        .then (channel) =>
            @_channelInProgress = channel
            Promise.all(
                @_setups.map (setupFn) =>
                    pb.callFn setupFn, 1, null, channel
                    .catch (err) =>
                        @emit 'error', err, {name: @name}
            ).then -> channel

        .then (channel) =>
            @_channelInProgress = null
            @_channel = channel

            # Since we just connected, publish any queued messages
            @_startWorker()

            @emit 'connect'

        .catch (err) =>
            @emit 'error', err, {name: @name}

    # Called whenever we disconnect from the AMQP server.
    _onDisconnect: =>
        @_channel?.close()
        @_channel = null

    # Adds a new 'setup handler'.
    #
    # `setup(channel, [cb])` is a function to call when a new underlying channel is created - handy for asserting
    # exchanges and queues exists, and whatnot.  The `channel` object here is a ConfigChannel from amqplib.
    # The `setup` function should return a Promise (or optionally take a callback) - no messages will be sent until
    # this Promise resolves.
    #
    # If there is a connection, `setup()` will be run immediately, and the addSetup Promise/callback won't resolve
    # until `setup` is complete.  Note that in this case, if the setup throws an error, no 'error' event will
    # be emitted, since you can just handle the error here (although the `setup` will still be added for future
    # reconnects, even if it throws an error.)
    #
    # Setup functions should, ideally, not throw errors, but if they do then the ChannelWrapper will emit an 'error'
    # event.
    addSetup: pb.break (setup) ->
        Promise.resolve()
        .then =>
            @_setups.push setup
            if @_channel then setup @_channel

    # Remove a setup function added with `addSetup`.  If there is currently connection, `teardown(channel, [cb])` will
    # be run immediately, and the returned Promise will not resolve until it completes.
    #
    removeSetup: pb.break (setup, teardown) ->
        @_setups = _.without @_setups, setup

        if @_channel and teardown?
            pb.callFn teardown, 1, null, @_channel

    # Returns the number of unsent messages queued on this channel.
    queueLength: -> return @_messages.length

    # Destroy this channel.
    #
    # Any unsent messages will have their associated Promises rejected.
    #
    close: ->
        if @_messages.length isnt 0
            # Reject any unsent messages.
            @_messages.forEach (message) -> message.reject()

        @_connectionManager.removeListener 'connect', @_onConnect
        @_connectionManager.removeListener 'disconnect', @_onDisconnect
        @_channel?.close()
        @_channel = null

        @emit 'close'

    # Returns a Promise which resolves when this channel next connects.
    # (Mainly here for unit testing...)
    waitForConnect: pb.break ->
        if @_channel
            return Promise.resolve()
        else
            return new Promise (resolve) => @once 'connect', resolve

    # Start publishing queued messages, if there isn't already a worker doing this.
    _startWorker: ->
        if @_channel and !@_working
            @_working = true
            @_publishQueuedMessages()

    _publishQueuedMessages: ->
        if @_messages.length is 0 or !@_channel
            # Can't publish anything right now...
            @_working = false
            return Promise.resolve()

        channel = @_channel
        message = @_messages[0]

        Promise.resolve()
        .then =>
            encodedMessage = if @_json then new Buffer(JSON.stringify message.content) else message.content

            sendPromise = switch message.type
                when 'publish'
                    new Promise (resolve, reject) ->
                        result = channel.publish message.exchange, message.routingKey, encodedMessage,
                            message.options, (err) ->
                                return reject err if err
                                setImmediate -> resolve result
                when 'sendToQueue'
                    new Promise (resolve, reject) ->
                        result = channel.sendToQueue message.queue, encodedMessage, message.options, (err) ->
                                return reject err if err
                                setImmediate -> resolve result

                else
                    ### !pragma coverage-skip-block ###
                    throw new Error "Unhandled message type #{message.type}"

            return sendPromise

        .then(
            (result) =>
                @_messages.shift()
                message.resolve result
            (err) =>
                # Something went wrong trying to send this message - could be JSON.stringify failed, could be the
                # broker rejected the message.  Either way, reject it back
                @_messages.shift()
                message.reject err
        )
        .then =>
            # Send some more!
            @_publishQueuedMessages()

        .catch (err) =>
            ### !pragma coverage-skip-block ###
            console.error "amqp-connection-manager: ChannelWrapper:_publishQueuedMessages() - How did you get here?",
                err.stack
            @emit 'error', err
            @_working = false

        return null

    # Send an `ack` to the underlying channel.
    ack: (args...) ->
        # Need @_channelInProgress here, because we can hook up a listener in a `setup`, and start receiving messages
        # before we've finsihed running all the other `setup`s.
        channel = @_channelInProgress ? @_channel
        if channel then channel.ack(args...)

    # Send a `nack` to the underlying channel.
    nack: (args...) ->
        channel = @_channelInProgress ? @_channel
        if channel then channel.nack(args...)

    # Publish a message to the channel.
    #
    # This works just like amqplib's `publish()`, except if the channel is not connected, this will wait until the
    # channel is connected.  Returns a Promise which will only resolve when the message has been succesfully sent.
    # The returned promise will be rejected if `close()` is called on this channel before it can be sent, if
    # `options.json` is set and the message can't be encoded, or if the broker rejects the message for some reason.
    #
    publish: pb.break (exchange, routingKey, content, options) ->
        return new Promise (resolve, reject) =>
            @_messages.push {type: 'publish', exchange, routingKey, content, options, resolve, reject}
            @_startWorker()

    # Send a message to a queue.
    #
    # This works just like amqplib's `sendToQueue`, except if the channel is not connected, this will wait until the
    # channel is connected.  Returns a Promise which will only resolve when the message has been succesfully sent.
    # The returned promise will be rejected only if `close()` is called on this channel before it can be sent.
    #
    # `message` here should be a JSON-able object.
    #
    sendToQueue: pb.break (queue, content, options) ->
        return new Promise (resolve, reject) =>
            @_messages.push {type: 'sendToQueue', queue, content, options, resolve, reject}
            @_startWorker()

module.exports = ChannelWrapper

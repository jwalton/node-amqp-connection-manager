chai       = require 'chai'
chai.use     require('chai-as-promised')
{expect}   = chai
sinon      = require 'sinon'
fixtures   = require './fixtures'
{wait}     = require '../src/helpers'

ChannelWrapper = require '../src/ChannelWrapper'


describe 'ChannelWrapper', ->
    connectionManager = null

    beforeEach ->
        connectionManager = new fixtures.FakeAmqpConnectionManager()

    afterEach ->

    it 'should run all setup functions on connect', ->
        setup1 = sinon.spy -> wait 10
        setup2 = sinon.spy -> wait 10

        channelWrapper = new ChannelWrapper connectionManager, {setup: setup1}
        channelWrapper.addSetup setup2
        .then ->
            expect(setup1.callCount).to.equal 0
            expect(setup2.callCount).to.equal 0

            connectionManager.simulateConnect()

            channelWrapper.waitForConnect()
        .then ->
            expect(setup1.callCount).to.equal 1
            expect(setup2.callCount).to.equal 1

    it 'should run all setup functions on reconnect', ->
        setup1 = sinon.spy -> Promise.resolve()
        setup2 = sinon.spy -> Promise.resolve()

        channelWrapper = new ChannelWrapper connectionManager, {setup: setup1}
        channelWrapper.addSetup setup2
        .then ->
            connectionManager.simulateConnect()
            channelWrapper.waitForConnect()
        .then ->
            expect(setup1.callCount).to.equal 1
            expect(setup2.callCount).to.equal 1

            channel = channelWrapper._channel

            connectionManager.simulateDisconnect()

            connectionManager.simulateConnect()
            channelWrapper.waitForConnect()
        .then ->
            expect(setup1.callCount).to.equal 2
            expect(setup2.callCount).to.equal 2

    it 'should emit an error if a setup function throws', ->
        setup1 = sinon.spy -> Promise.resolve()
        setup2 = sinon.spy -> Promise.reject new Error 'Boom!'
        errors = []

        channelWrapper = new ChannelWrapper connectionManager, {setup: setup1}
        channelWrapper.on 'error', (err) -> errors.push err
        channelWrapper.addSetup setup2
        .then ->
            connectionManager.simulateConnect()
        .then ->
            waitForCall = ->
                if setup2.callCount is 0
                    wait(10).then -> waitForCall()
                else
                    Promise.resolve()
            waitForCall()
        .then ->
            expect(setup1.callCount).to.equal 1
            expect(setup2.callCount).to.equal 1
            expect(errors.length).to.equal 1

    it 'should not emit an error if a setup function throws because the channel is closed', ->
        setup1 = sinon.spy (channel) ->
            Promise.resolve()
            .then -> channel.close()

        setup2 = sinon.spy -> wait(20).then -> throw new Error 'Boom!'

        errors = []

        channelWrapper = new ChannelWrapper connectionManager, {setup: setup1}
        channelWrapper.on 'error', (err) -> errors.push err
        channelWrapper.addSetup setup2
        .then -> connectionManager.simulateConnect()
        .then -> wait(50)
        .then ->
            expect(setup1.callCount).to.equal 1
            expect(setup2.callCount).to.equal 1
            expect(errors.length).to.equal 0

    it 'should return immediately from waitForConnect if we are already connected', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.waitForConnect()
        .then ->
            channelWrapper.waitForConnect()

    it 'should run setup functions immediately if already connected', ->
        setup1 = sinon.spy -> wait 10
        setup2 = sinon.spy -> wait 10

        connectionManager.simulateConnect()

        channelWrapper = new ChannelWrapper connectionManager, {setup: setup1}

        channelWrapper.waitForConnect()
        .then ->
            # Initial setup will be run in background - wait for connect event.
            expect(setup1.callCount).to.equal 1

            channelWrapper.addSetup setup2
        .then ->
            # Any setups we add after this should get run right away, though.
            expect(setup2.callCount).to.equal 1

    it 'should emit errors if setup functions fail to run at connect time', ->
        setup = -> Promise.reject new Error 'Bad setup!'
        setup2 = -> Promise.reject new Error 'Bad setup2!'
        errorHandler = sinon.spy ->

        channelWrapper = new ChannelWrapper connectionManager, {setup}
        channelWrapper.on 'error', errorHandler

        connectionManager.simulateConnect()

        channelWrapper.waitForConnect()
        .then ->
            expect(errorHandler.calledOnce, 'error event').to.be.true
            expect(errorHandler.lastCall.args[0].message).to.equal 'Bad setup!'

            expect(
                channelWrapper.addSetup setup2
            ).to.be.rejectedWith 'Bad setup2!'
        .then ->
            # Should not be an `error` event here, since we theoretically just handled the error.
            expect(errorHandler.calledOnce, 'no second error event').to.be.true

    it 'should emit an error if amqplib refuses to create a channel for us', ->
        errorHandler = sinon.spy ->

        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.on 'error', errorHandler

        channelWrapper._onConnect {
            connection:
                createConfirmChannel: -> Promise.reject new Error 'No channel for you!'
        }
        .then ->
            expect(errorHandler.calledOnce, 'error event').to.be.true
            expect(errorHandler.lastCall.args[0].message).to.equal 'No channel for you!'

    it 'should work if there are no setup functions', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.waitForConnect()
        .then ->
            # Yay!  We didn't blow up!

    it 'should publish messages to the underlying channel', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.waitForConnect()
        .then ->
            channelWrapper.publish 'exchange', 'routingKey', 'argleblargle', {options: true}
        .then (result) ->
            expect(result, 'result').to.equal true

            # get the underlying channel
            channel = channelWrapper._channel
            expect(channel.publish.calledOnce, 'called publish').to.be.true
            expect(channel.publish.lastCall.args[0...4], 'publish args').to.eql(
                ['exchange', 'routingKey', 'argleblargle', {options: true}])

            # Try without options
            channelWrapper.publish 'exchange', 'routingKey', 'argleblargle'

        .then (result) ->
            expect(result, 'second result').to.equal true

            # get the underlying channel
            channel = channelWrapper._channel
            expect(channel.publish.calledTwice, 'second call to publish').to.be.true
            expect(channel.publish.lastCall.args[0...4], 'second args').to.eql(
                ['exchange', 'routingKey', 'argleblargle', undefined])
            expect(channelWrapper.queueLength(), 'queue length').to.equal 0

    it 'should sendToQueue messages to the underlying channel', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.waitForConnect()
        .then ->
            channelWrapper.sendToQueue 'queue', 'argleblargle', {options: true}
        .then (result) ->
            expect(result, 'result').to.equal true

            # get the underlying channel
            channel = channelWrapper._channel
            expect(channel.sendToQueue.calledOnce, 'called sendToQueue').to.be.true
            expect(channel.sendToQueue.lastCall.args[0...3], 'args').to.eql(['queue', 'argleblargle', {options: true}])
            expect(channelWrapper.queueLength(), 'queue length').to.equal 0

    it 'should queue messages for the underlying channel when disconnected', ->
        channelWrapper = new ChannelWrapper connectionManager
        p1 = channelWrapper.publish 'exchange', 'routingKey', 'argleblargle', {options: true}
        p2 = channelWrapper.sendToQueue 'queue', 'argleblargle', {options: true}

        expect(channelWrapper.queueLength(), 'queue length').to.equal 2
        connectionManager.simulateConnect()
        channelWrapper.waitForConnect()
        .then -> Promise.all [p1, p2]
        .then ->

            # get the underlying channel
            channel = channelWrapper._channel
            expect(channel.publish.calledOnce, 'called publish').to.be.true
            expect(channel.sendToQueue.calledOnce, 'called sendToQueue').to.be.true
            expect(channelWrapper.queueLength(), 'queue length after sending everything').to.equal 0

    it 'should queue messages for the underlying channel if channel closes while we are trying to send', ->
        channelWrapper = new ChannelWrapper connectionManager
        p1 = null

        connectionManager.simulateConnect()
        channelWrapper.waitForConnect()
        .then ->
            channelWrapper._channel.publish = (exchange, routingKey, encodedMessage, options, cb) ->
                @close()
                cb new Error 'Channel closed'
            p1 = channelWrapper.publish 'exchange', 'routingKey', 'argleblargle', {options: true}

            wait(10)

        .then ->
            expect(channelWrapper._channel).to.not.exist

            connectionManager.simulateDisconnect()
            connectionManager.simulateConnect()
            channelWrapper.waitForConnect()
            return p1

        .then ->
            # get the underlying channel
            channel = channelWrapper._channel
            expect(channel.publish.calledOnce, 'called publish').to.be.true
            expect(channelWrapper.queueLength(), 'queue length after sending everything').to.equal 0

    it 'should run all setup messages prior to sending any queued messages', ->
        order = []

        setup = (channel) ->
            order.push 'setup'

            # Since this should get run before anything gets sent, this is where we need to add listeners to the
            # underlying channel.
            channel.on 'publish', -> order.push 'publish'
            channel.on 'sendToQueue', -> order.push 'sendToQueue'

            Promise.resolve()

        channelWrapper = new ChannelWrapper connectionManager


        p1 = channelWrapper.publish 'exchange', 'routingKey', 'argleblargle', {options: true}
        p2 = channelWrapper.sendToQueue 'queue', 'argleblargle', {options: true}

        channelWrapper.addSetup setup
        .then ->
            connectionManager.simulateConnect()
            channelWrapper.waitForConnect()
        .then -> Promise.all [p1, p2]
        .then ->
            expect(order).to.eql ['setup', 'publish', 'sendToQueue']

    it 'should remove setup messages', ->
        order = []

        setup = sinon.spy -> Promise.resolve()

        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.addSetup setup
        .then ->
            channelWrapper.removeSetup setup
        .then ->
            connectionManager.simulateConnect()
            channelWrapper.waitForConnect()

        .then ->
            expect(setup.callCount).to.equal 0

    it 'should run teardown when removing a setup if we are connected', ->
        order = []

        setup = sinon.spy -> Promise.resolve()
        teardown = sinon.spy -> Promise.resolve()

        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.addSetup setup
        .then ->
            expect(teardown.callCount, 'pre-teardown count').to.equal 0

            connectionManager.simulateConnect()
            channelWrapper.waitForConnect()

        .then ->
            channelWrapper.removeSetup setup, teardown

        .then ->
            expect(teardown.calledOnce, 'should call teardown').to.be.true

    it 'should proxy acks and nacks to the underlying channel', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.waitForConnect()
        .then ->
            # get the underlying channel
            channel = channelWrapper._channel

            channelWrapper.ack('a', true)
            expect(channel.ack.calledOnce).to.be.true
            expect(channel.ack.lastCall.args).to.eql ['a', true]

            channelWrapper.ack('b')
            expect(channel.ack.calledTwice).to.be.true
            expect(channel.ack.lastCall.args).to.eql ['b']

            channelWrapper.nack('c', false, true)
            expect(channel.nack.calledOnce).to.be.true
            expect(channel.nack.lastCall.args).to.eql ['c', false, true]

    it 'should proxy acks and nacks to the underlying channel, even if we aren\'t done setting up', ->
        channelWrapper = new ChannelWrapper connectionManager

        channelWrapper.addSetup (channel) ->
            channelWrapper.ack('a')
            channelWrapper.nack('b')
            Promise.resolve()

        connectionManager.simulateConnect()

        channelWrapper.waitForConnect()
        .then ->
            channel = channelWrapper._channel
            expect(channel.ack.calledOnce).to.be.true
            expect(channel.ack.lastCall.args).to.eql ['a']
            expect(channel.nack.calledOnce).to.be.true
            expect(channel.nack.lastCall.args).to.eql ['b']

    it 'should ignore acks and nacks if we are disconnected', ->
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.ack('a', true)
        channelWrapper.nack('c', false, true)

        # Not much to test here - just make sure we don't throw any exceptions or anything weird.  :)

    it 'clean up when closed', ->
        closeEvents = 0

        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager
        channelWrapper.on 'close', -> closeEvents++
        channelWrapper.waitForConnect()
        .then ->
            channel = channelWrapper._channel
            channelWrapper.close()
            .then ->
                # Should close the channel.
                expect(channel.close.calledOnce).to.be.true

                # Channel should let the connectionManager know it's going away.
                expect(closeEvents).to.equal 1

    it 'clean up when closed when not connected', ->
        closeEvents = 0

        Promise.resolve()
        .then ->
            channelWrapper = new ChannelWrapper connectionManager
            channelWrapper.on 'close', -> closeEvents++
            channelWrapper.close()
        .then ->
            # Channel should let the connectionManager know it's going away.
            expect(closeEvents).to.equal 1

    it 'reject outstanding messages when closed', ->
        channelWrapper = new ChannelWrapper connectionManager
        p1 = channelWrapper.publish 'exchange', 'routingKey', 'argleblargle', {options: true}
        Promise.all [
            channelWrapper.close(),
            expect(p1).to.be.rejected
        ]

    it 'should encode JSON messages', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager, {json: true}
        channelWrapper.waitForConnect()
        .then ->
            channelWrapper.publish 'exchange', 'routingKey', {message: 'woo'}
        .then ->
            # get the underlying channel
            channel = channelWrapper._channel
            expect(channel.publish.calledOnce, 'called publish').to.be.true
            content = channel.publish.lastCall.args[2]
            expect(content.write?, 'content should be a buffer').to.be.true

    it 'should reject messages when JSON encoding fails', ->
        badJsonMesage = {}
        badJsonMesage.x = badJsonMesage

        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager, {json: true}
        channelWrapper.waitForConnect()
        .then ->
            p1 = channelWrapper.publish 'exchange', 'routingKey', badJsonMesage
            expect(p1).to.be.rejected

    it 'should reject messages if they get rejected by the broker', ->
        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager, {
            setup: (channel) ->
                channel.publish = (a,b,c,d,cb) -> cb new Error 'no publish'
                channel.sendToQueue = (a,b,c,cb) -> cb new Error 'no send'
                Promise.resolve()
        }

        channelWrapper.waitForConnect()
        .then ->
            p1 = channelWrapper.publish 'exchange', 'routingKey', 'content'
            p2 = channelWrapper.sendToQueue 'queue', 'content'

            expect(p1).to.be.rejectedWith 'no publish'
            .then -> expect(p2).to.be.rejectedWith 'no send'

    it 'should keep sending messages, even if we disconnect in the middle of sending', ->
        publishCalls = 0
        p1 = null

        connectionManager.simulateConnect()
        channelWrapper = new ChannelWrapper connectionManager, {
            setup: (channel) ->
                channel.publish = (a,b,c,d,cb) ->
                    publishCalls++
                    if publishCalls is 1
                        # Never reply, this channel is disconnected
                    else
                        cb(null)

                Promise.resolve()
        }

        channelWrapper.waitForConnect()
        .then ->
            p1 = channelWrapper.publish 'exchange', 'routingKey', 'content'
            wait(10)
        .then ->
            connectionManager.simulateDisconnect()
            wait(10)
        .then ->
            connectionManager.simulateConnect()
            p1
        .then ->
            expect(publishCalls).to.equal 2

import chai from 'chai';
import chaiString from 'chai-string';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import * as promiseTools from 'promise-tools';
import * as fixtures from './fixtures';

chai.use(chaiString);
chai.use(chaiAsPromised);
const { expect } = chai;

const ChannelWrapper = require('../src/ChannelWrapper').default;

describe('ChannelWrapper', function () {
    let connectionManager = null;

    beforeEach(function () {
        connectionManager = new fixtures.FakeAmqpConnectionManager();
    });

    afterEach(function () {});

    it('should run all setup functions on connect', async function () {
        const setup1 = sinon.spy(() => promiseTools.delay(10));
        const setup2 = sinon.spy(() => promiseTools.delay(10));

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup: setup1,
        });

        await channelWrapper.addSetup(setup2);

        expect(setup1.callCount).to.equal(0);
        expect(setup2.callCount).to.equal(0);

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();

        expect(setup1.callCount).to.equal(1);
        expect(setup2.callCount).to.equal(1);
    });

    it('should run all setup functions on reconnect', async function () {
        const setup1 = sinon.spy(() => Promise.resolve());
        const setup2 = sinon.spy(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });
        await channelWrapper.addSetup(setup2);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup1.callCount).to.equal(1);
        expect(setup2.callCount).to.equal(1);

        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup1.callCount).to.equal(2);
        expect(setup2.callCount).to.equal(2);
    });

    it('should set `this` correctly in a setup function', async function () {
        let whatIsThis;

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup() {
                whatIsThis = this;
            },
        });

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(whatIsThis).to.equal(channelWrapper);
    });

    it('should emit an error if a setup function throws', async function () {
        const setup1 = sinon.spy(() => Promise.resolve());
        const setup2 = sinon.spy(() => Promise.reject(new Error('Boom!')));
        const errors = [];

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup: setup1,
        });

        channelWrapper.on('error', (err) => errors.push(err));

        await channelWrapper.addSetup(setup2);

        connectionManager.simulateConnect();

        await promiseTools.whilst(
            () => setup2.callCount === 0,
            () => promiseTools.delay(10)
        );

        expect(setup1.callCount).to.equal(1);
        expect(setup2.callCount).to.equal(1);
        expect(errors.length).to.equal(1);
    });

    it('should not emit an error if a setup function throws because the channel is closed', async function () {
        const setup1 = sinon.spy((channel) => Promise.resolve().then(() => channel.close()));

        const setup2 = sinon.spy(() =>
            promiseTools.delay(20).then(function () {
                throw new Error('Boom!');
            })
        );

        const errors = [];

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });
        channelWrapper.on('error', (err) => errors.push(err));

        await channelWrapper.addSetup(setup2);
        connectionManager.simulateConnect();

        await promiseTools.delay(50);

        expect(setup1.callCount).to.equal(1);
        expect(setup2.callCount).to.equal(1);
        expect(errors.length).to.equal(0);
    });

    it('should return immediately from waitForConnect if we are already connected', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(() => channelWrapper.waitForConnect());
    });

    it('should run setup functions immediately if already connected', async function () {
        const setup1 = sinon.spy(() => promiseTools.delay(10));
        const setup2 = sinon.spy(() => promiseTools.delay(10));

        connectionManager.simulateConnect();

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup: setup1,
        });

        await channelWrapper.waitForConnect();
        // Initial setup will be run in background - wait for connect event.
        expect(setup1.callCount).to.equal(1);

        await channelWrapper.addSetup(setup2);

        // Any setups we add after this should get run right away, though.
        expect(setup2.callCount).to.equal(1);
    });

    it('should emit errors if setup functions fail to run at connect time', async function () {
        const setup = () => Promise.reject(new Error('Bad setup!'));
        const setup2 = () => Promise.reject(new Error('Bad setup2!'));
        const errorHandler = sinon.spy(function () {});

        const channelWrapper = new ChannelWrapper(connectionManager, { setup });
        channelWrapper.on('error', errorHandler);

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();

        expect(errorHandler.calledOnce, 'error event').to.be.true;
        expect(errorHandler.lastCall.args[0].message).to.equal('Bad setup!');

        await expect(channelWrapper.addSetup(setup2)).to.be.rejectedWith('Bad setup2!');

        // Should not be an `error` event here, since we theoretically just handled the error.
        expect(errorHandler.calledOnce, 'no second error event').to.be.true;
    });

    it('should emit an error if amqplib refuses to create a channel for us', async function () {
        const errorHandler = sinon.spy(function () {});

        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.on('error', errorHandler);

        await channelWrapper._onConnect({
            connection: {
                createConfirmChannel() {
                    return Promise.reject(new Error('No channel for you!'));
                },
            },
        });

        expect(errorHandler.calledOnce, 'error event').to.be.true;
        expect(errorHandler.lastCall.args[0].message).to.equal('No channel for you!');
    });

    it('should work if there are no setup functions', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {});
    });
    // Yay!  We didn't blow up!

    it('should publish messages to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper
            .waitForConnect()
            .then(() =>
                channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
                    options: true,
                })
            )
            .then(function (result) {
                expect(result, 'result').to.equal(true);

                // get the underlying channel
                const channel = channelWrapper._channel;
                expect(channel.publish.calledOnce, 'called publish').to.be.true;
                expect(channel.publish.lastCall.args.slice(0, 4), 'publish args').to.eql([
                    'exchange',
                    'routingKey',
                    'argleblargle',
                    {
                        options: true,
                    },
                ]);

                // Try without options
                return channelWrapper.publish('exchange', 'routingKey', 'argleblargle');
            })
            .then(function (result) {
                expect(result, 'second result').to.equal(true);

                // get the underlying channel
                const channel = channelWrapper._channel;
                expect(channel.publish.calledTwice, 'second call to publish').to.be.true;
                expect(channel.publish.lastCall.args.slice(0, 4), 'second args').to.eql([
                    'exchange',
                    'routingKey',
                    'argleblargle',
                    undefined,
                ]);
                return expect(channelWrapper.queueLength(), 'queue length').to.equal(0);
            });
    });

    it('should publish messages to the underlying channel with callbacks', function (done) {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect(function (err) {
            if (err) {
                return done(err);
            }
            return channelWrapper.publish(
                'exchange',
                'routingKey',
                'argleblargle',
                {
                    options: true,
                },
                function (err, result) {
                    if (err) {
                        return done(err);
                    }
                    try {
                        expect(result, 'result').to.equal(true);

                        // get the underlying channel
                        const channel = channelWrapper._channel;
                        expect(channel.publish.calledOnce, 'called publish').to.be.true;
                        expect(channel.publish.lastCall.args.slice(0, 4), 'publish args').to.eql([
                            'exchange',
                            'routingKey',
                            'argleblargle',
                            {
                                options: true,
                            },
                        ]);
                        return done();
                    } catch (error) {
                        err = error;
                        return done(err);
                    }
                }
            );
        });
    });

    it('should sendToQueue messages to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper
            .waitForConnect()
            .then(() =>
                channelWrapper.sendToQueue('queue', 'argleblargle', {
                    options: true,
                })
            )
            .then(function (result) {
                expect(result, 'result').to.equal(true);

                // get the underlying channel
                const channel = channelWrapper._channel;
                expect(channel.sendToQueue.calledOnce, 'called sendToQueue').to.be.true;
                expect(channel.sendToQueue.lastCall.args.slice(0, 3), 'args').to.eql([
                    'queue',
                    'argleblargle',
                    {
                        options: true,
                    },
                ]);
                return expect(channelWrapper.queueLength(), 'queue length').to.equal(0);
            });
    });

    it('should queue messages for the underlying channel when disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
            options: true,
        });
        const p2 = channelWrapper.sendToQueue('queue', 'argleblargle', {
            options: true,
        });

        expect(channelWrapper.queueLength(), 'queue length').to.equal(2);
        connectionManager.simulateConnect();
        return channelWrapper
            .waitForConnect()
            .then(() => Promise.all([p1, p2]))
            .then(function () {
                // get the underlying channel
                const channel = channelWrapper._channel;
                expect(channel.publish.calledOnce, 'called publish').to.be.true;
                expect(channel.sendToQueue.calledOnce, 'called sendToQueue').to.be.true;
                return expect(
                    channelWrapper.queueLength(),
                    'queue length after sending everything'
                ).to.equal(0);
            });
    });

    it('should queue messages for the underlying channel if channel closes while we are trying to send', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        let p1 = null;

        connectionManager.simulateConnect();
        return channelWrapper
            .waitForConnect()
            .then(function () {
                channelWrapper._channel.publish = function (
                    exchange,
                    routingKey,
                    encodedMessage,
                    options,
                    cb
                ) {
                    this.close();
                    return cb(new Error('Channel closed'));
                };
                p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
                    options: true,
                });

                return promiseTools.delay(10);
            })
            .then(function () {
                expect(channelWrapper._channel).to.not.exist;

                connectionManager.simulateDisconnect();
                connectionManager.simulateConnect();
                channelWrapper.waitForConnect();
                return p1;
            })
            .then(function () {
                // get the underlying channel
                const channel = channelWrapper._channel;
                expect(channel.publish.calledOnce, 'called publish').to.be.true;
                return expect(
                    channelWrapper.queueLength(),
                    'queue length after sending everything'
                ).to.equal(0);
            });
    });

    it('should run all setup messages prior to sending any queued messages', function () {
        const order = [];

        const setup = function (channel) {
            order.push('setup');

            // Since this should get run before anything gets sent, this is where we need to add listeners to the
            // underlying channel.
            channel.on('publish', () => order.push('publish'));
            channel.on('sendToQueue', () => order.push('sendToQueue'));

            return Promise.resolve();
        };

        const channelWrapper = new ChannelWrapper(connectionManager);

        const p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
            options: true,
        });
        const p2 = channelWrapper.sendToQueue('queue', 'argleblargle', {
            options: true,
        });

        return channelWrapper
            .addSetup(setup)
            .then(function () {
                connectionManager.simulateConnect();
                return channelWrapper.waitForConnect();
            })
            .then(() => Promise.all([p1, p2]))
            .then(() => expect(order).to.eql(['setup', 'publish', 'sendToQueue']));
    });

    it('should remove setup messages', function () {
        const setup = sinon.spy(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper
            .addSetup(setup)
            .then(() => channelWrapper.removeSetup(setup))
            .then(function () {
                connectionManager.simulateConnect();
                return channelWrapper.waitForConnect();
            })
            .then(() => expect(setup.callCount).to.equal(0));
    });

    it('should run teardown when removing a setup if we are connected', async function () {
        const setup = sinon.spy(() => Promise.resolve());
        const teardown = sinon.spy(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.addSetup(setup);

        expect(teardown.callCount, 'pre-teardown count').to.equal(0);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        await channelWrapper.removeSetup(setup, teardown);
        expect(teardown.calledOnce, 'should call teardown').to.be.true;
    });

    it('should proxy acks and nacks to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = channelWrapper._channel;

            channelWrapper.ack('a', true);
            expect(channel.ack.calledOnce).to.be.true;
            expect(channel.ack.lastCall.args).to.eql(['a', true]);

            channelWrapper.ack('b');
            expect(channel.ack.calledTwice).to.be.true;
            expect(channel.ack.lastCall.args).to.eql(['b']);

            channelWrapper.ackAll();
            expect(channel.ackAll.calledOnce).to.be.true;

            channelWrapper.nack('c', false, true);
            expect(channel.nack.calledOnce).to.be.true;
            expect(channel.nack.lastCall.args).to.eql(['c', false, true]);

            channelWrapper.nackAll(true);
            expect(channel.nackAll.calledOnce).to.be.true;
            expect(channel.nackAll.lastCall.args).to.eql([true]);
        });
    });

    it("should proxy acks and nacks to the underlying channel, even if we aren't done setting up", function () {
        const channelWrapper = new ChannelWrapper(connectionManager);

        channelWrapper.addSetup(function () {
            channelWrapper.ack('a');
            channelWrapper.nack('b');
            return Promise.resolve();
        });

        connectionManager.simulateConnect();

        return channelWrapper.waitForConnect().then(function () {
            const channel = channelWrapper._channel;
            expect(channel.ack.calledOnce).to.be.true;
            expect(channel.ack.lastCall.args).to.eql(['a']);
            expect(channel.nack.calledOnce).to.be.true;
            return expect(channel.nack.lastCall.args).to.eql(['b']);
        });
    });

    it('should ignore acks and nacks if we are disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.ack('a', true);
        return channelWrapper.nack('c', false, true);
    });

    it('should proxy assertQueue, bindQueue, assertExchange to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = channelWrapper._channel;

            channelWrapper.assertQueue('dog');
            expect(channel.assertQueue.calledOnce).to.be.true;
            expect(channel.assertQueue.lastCall.args).to.eql(['dog']);

            channelWrapper.bindQueue('dog', 'bone');
            expect(channel.bindQueue.calledOnce).to.be.true;
            expect(channel.bindQueue.lastCall.args).to.eql(['dog', 'bone']);

            channelWrapper.assertExchange('bone');
            expect(channel.assertExchange.calledOnce).to.be.true;
            expect(channel.assertExchange.lastCall.args).to.eql(['bone']);
        });
    });

    it(`should proxy assertQueue, bindQueue, assertExchange to the underlying channel,
      even if we aren't done setting up`, function () {
        const channelWrapper = new ChannelWrapper(connectionManager);

        channelWrapper.addSetup(function () {
            channelWrapper.assertQueue('dog');
            channelWrapper.bindQueue('dog', 'bone');
            channelWrapper.assertExchange('bone');
            return Promise.resolve();
        });

        connectionManager.simulateConnect();

        return channelWrapper.waitForConnect().then(function () {
            const channel = channelWrapper._channel;
            expect(channel.assertQueue.calledOnce).to.be.true;
            expect(channel.assertQueue.lastCall.args).to.eql(['dog']);

            expect(channel.bindQueue.calledOnce).to.be.true;
            expect(channel.bindQueue.lastCall.args).to.eql(['dog', 'bone']);

            expect(channel.assertExchange.calledOnce).to.be.true;
            expect(channel.assertExchange.lastCall.args).to.eql(['bone']);
        });
    });

    it('should ignore assertQueue, bindQueue, assertExchange if we are disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.assertQueue('dog', true);
        channelWrapper.bindQueue('dog', 'bone', true);
        channelWrapper.assertExchange('bone', true);
    });

    // Not much to test here - just make sure we don't throw any exceptions or anything weird.  :)

    it('clean up when closed', function () {
        let closeEvents = 0;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.on('close', () => closeEvents++);
        return channelWrapper.waitForConnect().then(function () {
            const channel = channelWrapper._channel;
            return channelWrapper.close().then(function () {
                // Should close the channel.
                expect(channel.close.calledOnce).to.be.true;

                // Channel should let the connectionManager know it's going away.
                return expect(closeEvents).to.equal(1);
            });
        });
    });

    it('clean up when closed when not connected', function () {
        let closeEvents = 0;

        return Promise.resolve()
            .then(function () {
                const channelWrapper = new ChannelWrapper(connectionManager);
                channelWrapper.on('close', () => closeEvents++);
                return channelWrapper.close();
            })
            .then(() =>
                // Channel should let the connectionManager know it's going away.
                expect(closeEvents).to.equal(1)
            );
    });

    it('reject outstanding messages when closed', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
            options: true,
        });
        return Promise.all([channelWrapper.close(), expect(p1).to.be.rejected]);
    });

    it('should encode JSON messages', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            json: true,
        });
        return channelWrapper
            .waitForConnect()
            .then(() =>
                channelWrapper.publish('exchange', 'routingKey', {
                    message: 'woo',
                })
            )
            .then(function () {
                // get the underlying channel
                const channel = channelWrapper._channel;
                expect(channel.publish.calledOnce, 'called publish').to.be.true;
                const content = channel.publish.lastCall.args[2];
                return expect(content.write, 'content should be a buffer').to.exist;
            });
    });

    it('should reject messages when JSON encoding fails', function () {
        const badJsonMesage = {};
        badJsonMesage.x = badJsonMesage;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            json: true,
        });
        return channelWrapper.waitForConnect().then(function () {
            const p1 = channelWrapper.publish('exchange', 'routingKey', badJsonMesage);
            return expect(p1).to.be.rejected;
        });
    });

    it('should reject messages if they get rejected by the broker', async function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel) {
                channel.publish = (a, b, c, d, cb) => {
                    cb(new Error('no publish'));
                    return true;
                };
                channel.sendToQueue = (a, b, c, cb) => {
                    cb(new Error('no send'));
                    return true;
                };
                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();

        const p1 = channelWrapper.publish('exchange', 'routingKey', 'content');
        const p2 = channelWrapper.sendToQueue('queue', 'content');

        await expect(p1).to.be.rejectedWith('no publish');
        await expect(p2).to.be.rejectedWith('no send');
    });

    it('should reject correct message if broker rejects out of order', async function () {
        connectionManager.simulateConnect();

        const callbacks = [];

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel) {
                channel.publish = (a, b, message, d, cb) => callbacks.push({ message, cb });
                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();

        channelWrapper.publish('exchange', 'routingKey', 'content1');
        const p2 = channelWrapper.publish('exchange', 'routingKey', 'content2');

        // Wait for both messages to be sent.
        while (callbacks.length < 2) {
            await promiseTools.delay(10);
        }

        // Nack the second message.
        callbacks.find((c) => c.message === 'content2').cb(new Error('boom'));
        await expect(p2).to.be.rejectedWith('boom');

        // Simulate a disconnect and reconnect.
        connectionManager.simulateDisconnect();
        await promiseTools.delay(10);
        connectionManager.simulateConnect();
        while (callbacks.length < 3) {
            await promiseTools.delay(10);
        }

        // Make sure the first message is resent.
        const resent = callbacks[callbacks.length - 1];
        expect(resent.message).to.equal('content1');
    });

    it('should keep sending messages, even if we disconnect in the middle of sending', function () {
        let publishCalls = 0;
        let p1 = null;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel) {
                channel.publish = function (a, b, c, d, cb) {
                    publishCalls++;
                    if (publishCalls === 1) {
                        // Never reply, this channel is disconnected
                    } else {
                        cb(null);
                    }
                };

                return Promise.resolve();
            },
        });

        return channelWrapper
            .waitForConnect()
            .then(function () {
                p1 = channelWrapper.publish('exchange', 'routingKey', 'content');
                return promiseTools.delay(10);
            })
            .then(function () {
                connectionManager.simulateDisconnect();
                return promiseTools.delay(10);
            })
            .then(function () {
                connectionManager.simulateConnect();
                return p1;
            })
            .then(() => expect(publishCalls).to.equal(2));
    });

    it('should emit an error, we disconnect during publish with code 502 (AMQP Frame Syntax Error)', function () {
        connectionManager.simulateConnect();
        const err = new Error('AMQP Frame Syntax Error');
        err.code = 502;
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel) {
                channel.publish = function (a, b, c, d, cb) {
                    connectionManager.simulateRemoteCloseEx(err);
                    cb();
                };
                return Promise.resolve();
            },
        });

        return channelWrapper
            .waitForConnect()
            .then(() => channelWrapper.publish('exchange', 'routingKey', 'content'))
            .then(function () {})
            .catch((e) => {
                expect(err).to.equal(e);
            });
    });

    it('should retry, we disconnect during publish with code 320 (AMQP Connection Forced Error)', function () {
        let publishCalls = 0;
        let p1 = null;
        connectionManager.simulateConnect();
        const err = new Error('AMQP Frame Syntax Error');
        err.code = 320;
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel) {
                channel.publish = function (a, b, c, d, cb) {
                    publishCalls++;
                    if (publishCalls === 1) {
                        // Never reply, this channel is disconnected
                        connectionManager.simulateRemoteCloseEx(err);
                    } else {
                        cb();
                    }
                };
                return Promise.resolve();
            },
        });

        return channelWrapper
            .waitForConnect()
            .then(function () {
                p1 = channelWrapper.publish('exchange', 'routingKey', 'content');
                return promiseTools.delay(10);
            })
            .then(function () {
                connectionManager.simulateConnect();
                return p1;
            })
            .then(() => expect(publishCalls).to.equal(2));
    });

    it('should publish enqued messages to the underlying channel without waiting for confirms', function () {
        connectionManager.simulateConnect();
        let p1, p2;
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel) {
                channel.publish = sinon.stub().callsFake(() => true);
                return Promise.resolve();
            },
        });

        return channelWrapper
            .waitForConnect()
            .then(() => {
                p1 = channelWrapper.publish('exchange', 'routingKey', 'msg:1');
                p2 = channelWrapper.publish('exchange', 'routingKey', 'msg:2');
                return promiseTools.delay(10);
            })
            .then(() => {
                const channel = channelWrapper._channel;
                expect(channel.publish.calledTwice).to.be.true;
                expect(p1).to.not.be.fulfilled;
                expect(p2).to.not.be.fulfilled;
            });
    });
});

/* eslint-disable @typescript-eslint/no-empty-function */

import * as amqplib from 'amqplib';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiJest from 'chai-jest';
import chaiString from 'chai-string';
import * as promiseTools from 'promise-tools';
import ChannelWrapper, { SetupFunc } from '../src/ChannelWrapper';
import * as fixtures from './fixtures';

chai.use(chaiString);
chai.use(chaiJest);
chai.use(chaiAsPromised);
const { expect } = chai;

function makeMessage(content: string): amqplib.Message {
    return {
        content: Buffer.from(content),
        fields: {
            deliveryTag: 0,
            exchange: 'exchange',
            redelivered: false,
            routingKey: 'routingKey',
        },
        properties: {
            headers: {},
        } as any,
    };
}

function getUnderlyingChannel(channelWrapper: ChannelWrapper): fixtures.FakeConfirmChannel {
    const channel = (channelWrapper as any)._channel;
    if (!channel) {
        throw new Error('No underlying channel');
    }
    return channel;
}

describe('ChannelWrapper', function () {
    let connectionManager: fixtures.FakeAmqpConnectionManager;

    beforeEach(function () {
        connectionManager = new fixtures.FakeAmqpConnectionManager() as any;
    });

    it('should run all setup functions on connect', async function () {
        const setup1 = jest.fn().mockImplementation(() => promiseTools.delay(10));
        const setup2 = jest.fn().mockImplementation(() => promiseTools.delay(10));

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });

        await channelWrapper.addSetup(setup2);

        expect(setup1).to.have.beenCalledTimes(0);
        expect(setup2).to.have.beenCalledTimes(0);

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();

        expect(setup1).to.have.beenCalledTimes(1);
        expect(setup2).to.have.beenCalledTimes(1);
    });

    it('should run all setup functions on reconnect', async function () {
        const setup1 = jest.fn().mockImplementation(() => Promise.resolve());
        const setup2 = jest.fn().mockImplementation(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });
        await channelWrapper.addSetup(setup2);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup1).to.have.beenCalledTimes(1);
        expect(setup2).to.have.beenCalledTimes(1);

        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup1).to.have.beenCalledTimes(2);
        expect(setup2).to.have.beenCalledTimes(2);
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
        const setup1 = jest.fn().mockImplementation(() => Promise.resolve());
        const setup2 = jest.fn().mockImplementation(() => Promise.reject(new Error('Boom!')));
        const errors = [];

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup: setup1,
        });

        channelWrapper.on('error', (err) => errors.push(err));

        await channelWrapper.addSetup(setup2);

        connectionManager.simulateConnect();

        await promiseTools.whilst(
            () => setup2.mock.calls.length === 0,
            () => promiseTools.delay(10)
        );

        expect(setup1).to.have.beenCalledTimes(1);
        expect(setup2).to.have.beenCalledTimes(1);
        expect(errors.length).to.equal(1);
    });

    it('should not emit an error if a setup function throws because the channel is closed', async function () {
        const setup1 = jest
            .fn()
            .mockImplementation((channel) => Promise.resolve().then(() => channel.close()));

        const setup2 = jest.fn().mockImplementation(() =>
            promiseTools.delay(20).then(function () {
                const e = new Error('Channel closed');
                e.name = 'IllegalOperationError';
                throw e;
            })
        );

        const errors = [];

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });
        channelWrapper.on('error', (err) => errors.push(err));

        await channelWrapper.addSetup(setup2);
        connectionManager.simulateConnect();

        await promiseTools.delay(50);

        expect(setup1).to.have.beenCalledTimes(1);
        expect(setup2).to.have.beenCalledTimes(1);
        expect(errors.length).to.equal(0);
    });

    it('should return immediately from waitForConnect if we are already connected', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(() => channelWrapper.waitForConnect());
    });

    it('should run setup functions immediately if already connected', async function () {
        const setup1 = jest.fn().mockImplementation(() => promiseTools.delay(10));
        const setup2 = jest.fn().mockImplementation(() => promiseTools.delay(10));

        connectionManager.simulateConnect();

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup: setup1,
        });

        await channelWrapper.waitForConnect();
        // Initial setup will be run in background - wait for connect event.
        expect(setup1).to.have.beenCalledTimes(1);

        await channelWrapper.addSetup(setup2);

        // Any setups we add after this should get run right away, though.
        expect(setup2).to.have.beenCalledTimes(1);
    });

    it('should emit errors if setup functions fail to run at connect time', async function () {
        const setup = () => Promise.reject(new Error('Bad setup!'));
        const setup2 = () => Promise.reject(new Error('Bad setup2!'));
        const errorHandler = jest.fn().mockImplementation(function (_err: Error) {});

        const channelWrapper = new ChannelWrapper(connectionManager, { setup });
        channelWrapper.on('error', errorHandler);

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();

        expect(errorHandler).to.have.beenCalledTimes(1);
        expect(lastArgs(errorHandler)?.[0]?.message).to.equal('Bad setup!');

        await expect(channelWrapper.addSetup(setup2)).to.be.rejectedWith('Bad setup2!');

        // Should not be an `error` event here, since we theoretically just handled the error.
        expect(errorHandler, 'no second error event').to.have.beenCalledTimes(1);
    });

    it('should emit an error if amqplib refuses to create a channel for us', async function () {
        const errorHandler = jest.fn().mockImplementation(function (_err: Error) {});

        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.on('error', errorHandler);

        await (channelWrapper as any)._onConnect({
            connection: {
                createConfirmChannel() {
                    return Promise.reject(new Error('No channel for you!'));
                },
            },
        });

        expect(errorHandler).to.have.beenCalledTimes(1);
        expect(lastArgs(errorHandler)?.[0]?.message).to.equal('No channel for you!');
    });

    it('should work if there are no setup functions', async function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.waitForConnect();
        // Yay!  We didn't blow up!
    });

    it('should publish messages to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper
            .waitForConnect()
            .then(() =>
                channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
                    messageId: 'foo',
                })
            )
            .then(function (result) {
                expect(result, 'result').to.equal(true);

                // get the underlying channel
                const channel = getUnderlyingChannel(channelWrapper);
                expect(channel.publish).to.have.beenCalledTimes(1);
                expect(lastArgs(channel.publish).slice(0, 4)).to.eql([
                    'exchange',
                    'routingKey',
                    Buffer.from('argleblargle'),
                    { messageId: 'foo' },
                ]);

                // Try without options
                return channelWrapper.publish('exchange', 'routingKey', 'argleblargle');
            })
            .then(function (result) {
                expect(result, 'second result').to.equal(true);

                // get the underlying channel
                const channel = getUnderlyingChannel(channelWrapper);
                expect(channel.publish, 'second call to publish').to.have.beenCalledTimes(2);
                expect(lastArgs(channel.publish)?.slice(0, 4), 'second args').to.eql([
                    'exchange',
                    'routingKey',
                    Buffer.from('argleblargle'),
                    undefined,
                ]);
                expect(channelWrapper.queueLength(), 'queue length').to.equal(0);
            });
    });

    it('should publish messages to the underlying channel with callbacks', function (done: (
        err?: Error
    ) => void) {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.waitForConnect(function (err) {
            if (err) {
                return done(err);
            }
            return channelWrapper.publish(
                'exchange',
                'routingKey',
                'argleblargle',
                { messageId: 'foo' },
                function (err, result) {
                    if (err) {
                        return done(err);
                    }
                    try {
                        expect(result, 'result').to.equal(true);

                        // get the underlying channel
                        const channel = getUnderlyingChannel(channelWrapper);
                        if (!channel) {
                            throw new Error('No channel');
                        }
                        expect(channel.publish).to.have.beenCalledTimes(1);
                        expect(lastArgs(channel.publish)?.slice(0, 4), 'publish args').to.eql([
                            'exchange',
                            'routingKey',
                            Buffer.from('argleblargle'),
                            { messageId: 'foo' },
                        ]);
                        return done();
                    } catch (error) {
                        return done(error);
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
            .then(() => channelWrapper.sendToQueue('queue', 'argleblargle', { messageId: 'foo' }))
            .then(function (result) {
                expect(result, 'result').to.equal(true);

                // get the underlying channel
                const channel = getUnderlyingChannel(channelWrapper);
                expect(channel.sendToQueue).to.have.beenCalledTimes(1);
                expect(lastArgs(channel.sendToQueue)?.slice(0, 3), 'args').to.eql([
                    'queue',
                    Buffer.from('argleblargle'),
                    { messageId: 'foo' },
                ]);
                return expect(channelWrapper.queueLength(), 'queue length').to.equal(0);
            });
    });

    it('should queue messages for the underlying channel when disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
            messageId: 'foo',
        });
        const p2 = channelWrapper.sendToQueue('queue', 'argleblargle', {
            messageId: 'foo',
        });

        expect(channelWrapper.queueLength(), 'queue length').to.equal(2);
        connectionManager.simulateConnect();
        return channelWrapper
            .waitForConnect()
            .then(() => Promise.all([p1, p2]))
            .then(function () {
                // get the underlying channel
                const channel = getUnderlyingChannel(channelWrapper);
                expect(channel.publish).to.have.beenCalledTimes(1);
                expect(channel.sendToQueue).to.have.beenCalledTimes(1);
                return expect(
                    channelWrapper.queueLength(),
                    'queue length after sending everything'
                ).to.equal(0);
            });
    });

    it('should queue messages for the underlying channel if channel closes while we are trying to send', async function () {
        const channelWrapper = new ChannelWrapper(connectionManager);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();
        (channelWrapper as any)._channel.publish = function (
            _exchange: string,
            _routingKey: string,
            _encodedMessage: Buffer,
            _options: amqplib.Options.Publish,
            cb: (err?: Error) => void
        ) {
            this.close();
            return cb(new Error('Channel closed'));
        };

        const p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
            messageId: 'foo',
        });

        await promiseTools.delay(10);

        expect((channelWrapper as any)._channel).to.not.exist;

        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        channelWrapper.waitForConnect();

        await p1;

        // get the underlying channel
        const channel = getUnderlyingChannel(channelWrapper);
        expect(channel.publish).to.have.beenCalledTimes(1);
        return expect(
            channelWrapper.queueLength(),
            'queue length after sending everything'
        ).to.equal(0);
    });

    it('should run all setup messages prior to sending any queued messages', function () {
        const order: string[] = [];

        const setup: SetupFunc = function (channel: amqplib.ConfirmChannel) {
            order.push('setup');

            // Since this should get run before anything gets sent, this is where we need to add listeners to the
            // underlying channel.
            channel.on('publish', () => order.push('publish'));
            channel.on('sendToQueue', () => order.push('sendToQueue'));

            return Promise.resolve();
        };

        const channelWrapper = new ChannelWrapper(connectionManager);

        const p1 = channelWrapper.publish('exchange', 'routingKey', 'argleblargle', {
            messageId: 'foo',
        });
        const p2 = channelWrapper.sendToQueue('queue', 'argleblargle', {
            messageId: 'foo',
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

    it('should remove setup messages', async () => {
        const setup = jest.fn().mockImplementation(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.addSetup(setup);
        await channelWrapper.removeSetup(setup);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup).to.have.not.beenCalled;
    });

    it('should run teardown when removing a setup if we are connected', async function () {
        const setup = jest.fn().mockImplementation(() => Promise.resolve());
        const teardown = jest.fn().mockImplementation(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.addSetup(setup);

        expect(teardown, 'pre-teardown count').to.have.not.beenCalled;

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        await channelWrapper.removeSetup(setup, teardown);
        expect(teardown).to.have.beenCalledTimes(1);
    });

    it('should proxy acks and nacks to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = getUnderlyingChannel(channelWrapper);

            const message = makeMessage('a');
            channelWrapper.ack(message, true);
            expect(channel.ack).to.have.beenCalledTimes(1);
            expect(channel.ack).to.have.beenCalledWith(message, true);

            channelWrapper.ack(message);
            expect(channel.ack).to.have.beenCalledTimes(2);
            expect(channel.ack).to.have.beenCalledWith(message, undefined);

            channelWrapper.ackAll();
            expect(channel.ackAll).to.have.beenCalledTimes(1);

            channelWrapper.nack(message, false, true);
            expect(channel.nack).to.have.beenCalledTimes(1);
            expect(channel.nack).to.have.beenCalledWith(message, false, true);

            channelWrapper.nackAll(true);
            expect(channel.nackAll).to.have.beenCalledTimes(1);
            expect(channel.nackAll).to.have.beenCalledWith(true);
        });
    });

    it("should proxy acks and nacks to the underlying channel, even if we aren't done setting up", async () => {
        const channelWrapper = new ChannelWrapper(connectionManager);

        const a = makeMessage('a');
        const b = makeMessage('b');

        channelWrapper.addSetup(function () {
            channelWrapper.ack(a);
            channelWrapper.nack(b);
            return Promise.resolve();
        });

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();
        const channel = getUnderlyingChannel(channelWrapper);

        expect(channel.ack).to.have.beenCalledTimes(1);
        expect(channel.ack).to.have.beenCalledWith(a, undefined);
        expect(channel.nack).to.have.beenCalledTimes(1);
        expect(channel.nack).to.have.beenCalledWith(b, undefined, undefined);
    });

    it('should ignore acks and nacks if we are disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.ack(makeMessage('a'), true);
        return channelWrapper.nack(makeMessage('c'), false, true);
    });

    it('should proxy assertQueue, bindQueue, assertExchange to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = getUnderlyingChannel(channelWrapper);

            channelWrapper.assertQueue('dog');
            expect(channel.assertQueue).to.have.beenCalledTimes(1);
            expect(channel.assertQueue).to.have.beenCalledWith('dog', undefined);

            channelWrapper.bindQueue('dog', 'bone', '.*');
            expect(channel.bindQueue).to.have.beenCalledTimes(1);
            expect(channel.bindQueue).to.have.beenCalledWith('dog', 'bone', '.*', undefined);

            channelWrapper.assertExchange('bone', 'topic');
            expect(channel.assertExchange).to.have.beenCalledTimes(1);
            expect(channel.assertExchange).to.have.beenCalledWith('bone', 'topic', undefined);
        });
    });

    it(`should proxy assertQueue, bindQueue, assertExchange to the underlying channel, even if we aren't done setting up`, async () => {
        const channelWrapper = new ChannelWrapper(connectionManager);

        channelWrapper.addSetup(function () {
            channelWrapper.assertQueue('dog');
            channelWrapper.bindQueue('dog', 'bone', '.*');
            channelWrapper.assertExchange('bone', 'topic');
            return Promise.resolve();
        });

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();
        const channel = getUnderlyingChannel(channelWrapper);
        expect(channel.assertQueue).to.have.beenCalledTimes(1);
        expect(channel.assertQueue).to.have.beenCalledWith('dog', undefined);

        expect(channel.bindQueue).to.have.beenCalledTimes(1);
        expect(channel.bindQueue).to.have.beenCalledWith('dog', 'bone', '.*', undefined);

        expect(channel.assertExchange).to.have.beenCalledTimes(1);
        expect(channel.assertExchange).to.have.beenCalledWith('bone', 'topic', undefined);
    });

    it('should ignore assertQueue, bindQueue, assertExchange if we are disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.assertQueue('dog', { durable: true });
        channelWrapper.bindQueue('dog', 'bone', '.*');
        channelWrapper.assertExchange('bone', 'topic');
    });

    // Not much to test here - just make sure we don't throw any exceptions or anything weird.  :)

    it('clean up when closed', function () {
        let closeEvents = 0;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.on('close', () => closeEvents++);
        return channelWrapper.waitForConnect().then(function () {
            const channel = getUnderlyingChannel(channelWrapper);
            return channelWrapper.close().then(function () {
                // Should close the channel.
                expect(channel.close).to.have.beenCalledTimes(1);

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
            messageId: 'foo',
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
                const channel = getUnderlyingChannel(channelWrapper);
                expect(channel.publish).to.have.beenCalledTimes(1);
                const content = lastArgs(channel.publish)?.[2];
                return expect(content.write, 'content should be a buffer').to.exist;
            });
    });

    it('should reject messages when JSON encoding fails', function () {
        const badJsonMesage: { x: any } = { x: 7 };
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
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = (
                    _exchange: string,
                    _routingKey: string,
                    _encodedMessage: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) => {
                    cb(new Error('no publish'));
                    return true;
                };
                channel.sendToQueue = (_a: any, _b: any, _c: any, cb: (err?: Error) => void) => {
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

        const callbacks: {
            message: Buffer;
            cb: (err?: Error) => void;
        }[] = [];

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = (
                    _exchange: string,
                    _routingKey: string,
                    message: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) => {
                    callbacks.push({ message, cb });
                    return true;
                };
                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();

        channelWrapper.publish('exchange', 'routingKey', 'content1');
        const p2 = channelWrapper.publish('exchange', 'routingKey', 'content2');
        await promiseTools.delay(10);
        expect(callbacks).to.have.length(2);

        // Nack the second message.
        callbacks.find((c) => c.message.toString() === 'content2')?.cb(new Error('boom'));
        await expect(p2).to.be.rejectedWith('boom');

        // Simulate a disconnect and reconnect.
        connectionManager.simulateDisconnect();
        await promiseTools.delay(10);
        callbacks.find((c) => c.message.toString() === 'content1')?.cb(new Error('disconnected'));
        connectionManager.simulateConnect();
        await promiseTools.delay(10);
        expect(callbacks).to.have.length(3);

        // Make sure the first message is resent.
        const resent = callbacks[callbacks.length - 1];
        expect(resent.message.toString()).to.equal('content1');
    });

    it('should keep sending messages, even if we disconnect in the middle of sending', async function () {
        const callbacks: ((err: Error | undefined) => void)[] = [];

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = function (
                    _exchange: string,
                    _routingKey: string,
                    _message: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) {
                    callbacks.push(cb);
                    return true;
                };

                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'content');

        // Disconnect, and generate an error for the in-flight message.
        await promiseTools.delay(10);
        connectionManager.simulateDisconnect();
        expect(callbacks).to.have.length(1);
        callbacks[0](new Error('disconnected'));

        // Reconnect.  Should resend the message.
        await promiseTools.delay(10);
        connectionManager.simulateConnect();
        await promiseTools.delay(10);
        expect(callbacks).to.have.length(2);
        callbacks[1](undefined);
        await p1;
    });

    it('should handle getting a confirm out-of-order with a disconnect', async function () {
        const callbacks: ((err: Error | undefined) => void)[] = [];

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = function (
                    _exchange: string,
                    _routingKey: string,
                    _message: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) {
                    callbacks.push(cb);
                    return true;
                };

                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'content');

        // Disconnect.
        await promiseTools.delay(10);
        connectionManager.simulateDisconnect();
        expect(callbacks).to.have.length(1);

        // Message succeeds after disconnect.
        callbacks[0](undefined);

        // Reconnect.  Should resend the message.
        await promiseTools.delay(10);
        connectionManager.simulateConnect();
        await promiseTools.delay(10);
        expect(callbacks).to.have.length(1);
        await p1;
    });

    it('should handle getting a confirm out-of-order with a disconnect and reconnect', async function () {
        const callbacks: ((err: Error | undefined) => void)[] = [];

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = function (
                    _exchange: string,
                    _routingKey: string,
                    _message: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) {
                    callbacks.push(cb);
                    return true;
                };

                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'content');

        // Disconnect.
        await promiseTools.delay(10);
        connectionManager.simulateDisconnect();
        expect(callbacks).to.have.length(1);

        // Reconnect.
        await promiseTools.delay(10);
        connectionManager.simulateConnect();
        await promiseTools.delay(10);

        // Message from first connection succeeds after disconnect/reconnect.
        expect(callbacks).to.have.length(1);
        callbacks[0](undefined);
        await p1;
    });

    it('should emit an error, we disconnect during publish with code 502 (AMQP Frame Syntax Error)', function () {
        connectionManager.simulateConnect();
        const err = new Error('AMQP Frame Syntax Error');
        (err as any).code = 502;
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = function (
                    _exchange: string,
                    _routingKey: string,
                    _message: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) {
                    connectionManager.simulateRemoteCloseEx(err);
                    cb();
                    return true;
                };
                return Promise.resolve();
            },
        });

        return channelWrapper
            .waitForConnect()
            .then(() => channelWrapper.publish('exchange', 'routingKey', 'content'))
            .then(function () {})
            .catch((e) => {
                expect(e).to.equal(err);
            });
    });

    it('should retry, we disconnect during publish with code 320 (AMQP Connection Forced Error)', async function () {
        const callbacks: ((err: Error | undefined) => void)[] = [];

        connectionManager.simulateConnect();
        const err = new Error('AMQP Frame Syntax Error');
        (err as any).code = 320;
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = function (
                    _exchange: string,
                    _routingKey: string,
                    _message: Buffer,
                    _options: amqplib.Options.Publish,
                    cb: (err?: Error) => void
                ) {
                    callbacks.push(cb);
                    return true;
                };
                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'content');
        await promiseTools.delay(10);
        expect(callbacks).to.have.length(1);

        // Simulate disconnect during publish.
        connectionManager.simulateRemoteCloseEx(err);
        callbacks[0](new Error('disconnected'));

        // Reconnect.
        connectionManager.simulateConnect();
        await promiseTools.delay(10);

        // Message should be republished.
        expect(callbacks).to.have.length(2);
        callbacks[1](undefined);
        await p1;
    });

    it('should publish queued messages to the underlying channel without waiting for confirms', async function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup(channel: amqplib.ConfirmChannel) {
                channel.publish = jest.fn().mockImplementation(() => true);
                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'msg:1');
        const p2 = channelWrapper.publish('exchange', 'routingKey', 'msg:2');
        await promiseTools.delay(10);

        const channel = getUnderlyingChannel(channelWrapper);
        expect(channel.publish).to.have.beenCalledTimes(2);
        expect(p1).to.not.be.fulfilled;
        expect(p2).to.not.be.fulfilled;
    });

    it('should stop publishing messages to the queue when the queue is full', async function () {
        const queue: (() => void)[] = [];
        let innerChannel: amqplib.Channel = {} as any;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            async setup(channel: amqplib.ConfirmChannel) {
                innerChannel = channel;
                channel.publish = jest
                    .fn()
                    .mockImplementation((_exchage, _routingKey, content, _options, callback) => {
                        channel.emit('publish', content);
                        queue.push(() => callback(null));
                        return queue.length < 2;
                    });
            },
        });

        await channelWrapper.waitForConnect();

        channelWrapper.publish('exchange', 'routingKey', 'msg:1');
        channelWrapper.publish('exchange', 'routingKey', 'msg:2');
        channelWrapper.publish('exchange', 'routingKey', 'msg:3');
        await promiseTools.delay(10);

        // Only two messages should have been published to the underlying queue.
        expect(queue.length).to.equal(2);

        // Simulate queue draining.
        queue.pop()!();
        innerChannel.emit('drain');

        await promiseTools.delay(10);

        // Final message should have been published to the underlying queue.
        expect(queue.length).to.equal(2);
    });
});

/** Returns the arguments of the most recent call to this mock. */
function lastArgs<T, Y extends any[] = any>(mock: jest.Mock<T, Y>): Y | undefined {
    if (mock.mock.calls.length === 0) {
        return undefined;
    }
    return mock.mock.calls[mock.mock.calls.length - 1];
}

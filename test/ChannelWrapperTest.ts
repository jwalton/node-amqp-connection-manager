/* eslint-disable @typescript-eslint/no-empty-function */

import * as amqplib from 'amqplib';
import chaiAsPromised from 'chai-as-promised';
import chaiString from 'chai-string';
import * as promiseTools from 'promise-tools';
import { beforeEach, chai, describe, expect, it, Mock, vi } from 'vitest';
import ChannelWrapper, { SetupFunc } from '../src/ChannelWrapper';
import * as fixtures from './fixtures';

chai.use(chaiString);
chai.use(chaiAsPromised);
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

function getUnderlyingChannel(
    channelWrapper: ChannelWrapper
): fixtures.FakeConfirmChannel | fixtures.FakeChannel {
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
        const setup1 = vi.fn().mockImplementation(() => promiseTools.delay(10));
        const setup2 = vi.fn().mockImplementation(() => promiseTools.delay(10));

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });

        await channelWrapper.addSetup(setup2);

        expect(setup1).toHaveBeenCalledTimes(0);
        expect(setup2).toHaveBeenCalledTimes(0);

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();

        expect(setup1).toHaveBeenCalledTimes(1);
        expect(setup2).toHaveBeenCalledTimes(1);
    });

    it('should run all setup functions on reconnect', async function () {
        const setup1 = vi.fn().mockImplementation(() => Promise.resolve());
        const setup2 = vi.fn().mockImplementation(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager, { setup: setup1 });
        await channelWrapper.addSetup(setup2);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup1).toHaveBeenCalledTimes(1);
        expect(setup2).toHaveBeenCalledTimes(1);

        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup1).toHaveBeenCalledTimes(2);
        expect(setup2).toHaveBeenCalledTimes(2);
    });

    it('should set `this` correctly in a setup function', async function () {
        let whatIsThis;

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup() {
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                whatIsThis = this;
            },
        });

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(whatIsThis).to.equal(channelWrapper);
    });

    it('should emit an error if a setup function throws', async function () {
        const setup1 = vi.fn().mockImplementation(() => Promise.resolve());
        const setup2 = vi.fn().mockImplementation(() => Promise.reject(new Error('Boom!')));
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

        expect(setup1).toHaveBeenCalledTimes(1);
        expect(setup2).toHaveBeenCalledTimes(1);
        expect(errors.length).to.equal(1);
    });

    it('should not emit an error if a setup function throws because the channel is closed', async function () {
        const setup1 = vi
            .fn()
            .mockImplementation((channel) => Promise.resolve().then(() => channel.close()));

        const setup2 = vi.fn().mockImplementation(() =>
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

        expect(setup1).toHaveBeenCalledTimes(1);
        expect(setup2).toHaveBeenCalledTimes(1);
        expect(errors.length).to.equal(0);
    });

    it('should return immediately from waitForConnect if we are already connected', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(() => channelWrapper.waitForConnect());
    });

    it('should run setup functions immediately if already connected', async function () {
        const setup1 = vi.fn().mockImplementation(() => promiseTools.delay(10));
        const setup2 = vi.fn().mockImplementation(() => promiseTools.delay(10));

        connectionManager.simulateConnect();

        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup: setup1,
        });

        await channelWrapper.waitForConnect();
        // Initial setup will be run in background - wait for connect event.
        expect(setup1).toHaveBeenCalledTimes(1);

        await channelWrapper.addSetup(setup2);

        // Any setups we add after this should get run right away, though.
        expect(setup2).toHaveBeenCalledTimes(1);
    });

    it('should emit errors if setup functions fail to run at connect time', async function () {
        const setup = () => Promise.reject(new Error('Bad setup!'));
        const setup2 = () => Promise.reject(new Error('Bad setup2!'));
        const errorHandler = vi.fn().mockImplementation(function (_err: Error) {});

        const channelWrapper = new ChannelWrapper(connectionManager, { setup });
        channelWrapper.on('error', errorHandler);

        connectionManager.simulateConnect();

        await channelWrapper.waitForConnect();

        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(lastArgs(errorHandler)?.[0]?.message).to.equal('Bad setup!');

        await expect(channelWrapper.addSetup(setup2)).to.be.rejectedWith('Bad setup2!');

        // Should not be an `error` event here, since we theoretically just handled the error.
        expect(errorHandler, 'no second error event').toHaveBeenCalledTimes(1);
    });

    it('should emit an error if amqplib refuses to create a channel for us', async function () {
        const errorHandler = vi.fn().mockImplementation(function (_err: Error) {});

        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.on('error', errorHandler);

        await (channelWrapper as any)._onConnect({
            connection: {
                createConfirmChannel() {
                    return Promise.reject(new Error('No channel for you!'));
                },
            },
        });

        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(lastArgs(errorHandler)?.[0]?.message).to.equal('No channel for you!');
    });

    it('should create plain channel', async function () {
        const setup = vi.fn().mockImplementation(() => promiseTools.delay(10));

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            setup,
            confirm: false,
        });
        await channelWrapper.waitForConnect();

        expect(setup).toHaveBeenCalledTimes(1);
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
                expect(channel.publish).toHaveBeenCalledTimes(1);
                expect(lastArgs(channel.publish)?.slice(0, 4)).to.eql([
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
                expect(channel.publish, 'second call to publish').toHaveBeenCalledTimes(2);
                expect(lastArgs(channel.publish)?.slice(0, 4), 'second args').to.eql([
                    'exchange',
                    'routingKey',
                    Buffer.from('argleblargle'),
                    {},
                ]);
                expect(channelWrapper.queueLength(), 'queue length').to.equal(0);
            });
    });

    it('should publish messages to the underlying channel with callbacks', function () {
        return new Promise<void>((resolve, reject) => {
            connectionManager.simulateConnect();
            const channelWrapper = new ChannelWrapper(connectionManager);
            channelWrapper.waitForConnect(function (err) {
                if (err) {
                    return reject(err);
                }
                return channelWrapper.publish(
                    'exchange',
                    'routingKey',
                    'argleblargle',
                    { messageId: 'foo' },
                    function (err, result) {
                        if (err) {
                            return reject(err);
                        }
                        try {
                            expect(result, 'result').to.equal(true);

                            // get the underlying channel
                            const channel = getUnderlyingChannel(channelWrapper);
                            if (!channel) {
                                throw new Error('No channel');
                            }
                            expect(channel.publish).toHaveBeenCalledTimes(1);
                            expect(lastArgs(channel.publish)?.slice(0, 4), 'publish args').to.eql([
                                'exchange',
                                'routingKey',
                                Buffer.from('argleblargle'),
                                { messageId: 'foo' },
                            ]);
                            return resolve();
                        } catch (error) {
                            return reject(error);
                        }
                    }
                );
            });
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
                expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
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
                expect(channel.publish).toHaveBeenCalledTimes(1);
                expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
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
        expect(channel.publish).toHaveBeenCalledTimes(1);
        return expect(
            channelWrapper.queueLength(),
            'queue length after sending everything'
        ).to.equal(0);
    });

    it('should timeout published message', async function () {
        const channelWrapper = new ChannelWrapper(connectionManager);

        const startTime = Date.now();
        const error = await channelWrapper
            .publish('exchange', 'routingKey', 'argleblargle', {
                timeout: 100,
            })
            .catch((err) => err);
        const duration = Date.now() - startTime;
        expect(error.message).to.equal('timeout');
        expect(duration).to.be.approximately(100, 10);
    });

    it('should use default timeout for published messages', async function () {
        const channelWrapper = new ChannelWrapper(connectionManager, { publishTimeout: 100 });

        const startTime = Date.now();
        const error = await channelWrapper
            .publish('exchange', 'routingKey', 'argleblargle')
            .catch((err) => err);
        const duration = Date.now() - startTime;
        expect(error.message).to.equal('timeout');
        expect(duration).to.be.approximately(100, 10);
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
        const setup = vi.fn().mockImplementation(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.addSetup(setup);
        await channelWrapper.removeSetup(setup);

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(setup).not.toHaveBeenCalled();
    });

    it('should fail silently when removing a setup that was not added', async () => {
        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.removeSetup(() => undefined);
    });

    it('should run teardown when removing a setup if we are connected', async function () {
        const setup = vi.fn().mockImplementation(() => Promise.resolve());
        const teardown = vi.fn().mockImplementation(() => Promise.resolve());

        const channelWrapper = new ChannelWrapper(connectionManager);
        await channelWrapper.addSetup(setup);

        expect(teardown, 'pre-teardown count').not.toHaveBeenCalled();

        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        await channelWrapper.removeSetup(setup, teardown);
        expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('should proxy acks and nacks to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = getUnderlyingChannel(channelWrapper);

            const message = makeMessage('a');
            channelWrapper.ack(message, true);
            expect(channel.ack).toHaveBeenCalledTimes(1);
            expect(channel.ack).toHaveBeenCalledWith(message, true);

            channelWrapper.ack(message);
            expect(channel.ack).toHaveBeenCalledTimes(2);
            expect(channel.ack).toHaveBeenCalledWith(message, undefined);

            channelWrapper.ackAll();
            expect(channel.ackAll).toHaveBeenCalledTimes(1);

            channelWrapper.nack(message, false, true);
            expect(channel.nack).toHaveBeenCalledTimes(1);
            expect(channel.nack).toHaveBeenCalledWith(message, false, true);

            channelWrapper.nackAll(true);
            expect(channel.nackAll).toHaveBeenCalledTimes(1);
            expect(channel.nackAll).toHaveBeenCalledWith(true);
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

        expect(channel.ack).toHaveBeenCalledTimes(1);
        expect(channel.ack).toHaveBeenCalledWith(a, undefined);
        expect(channel.nack).toHaveBeenCalledTimes(1);
        expect(channel.nack).toHaveBeenCalledWith(b, undefined, undefined);
    });

    it('should ignore acks and nacks if we are disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.ack(makeMessage('a'), true);
        return channelWrapper.nack(makeMessage('c'), false, true);
    });

    it('should proxy assertQueue, checkQueue, bindQueue, assertExchange, checkExchange to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = getUnderlyingChannel(channelWrapper);

            channelWrapper.assertQueue('dog');
            expect(channel.assertQueue).toHaveBeenCalledTimes(1);
            expect(channel.assertQueue).toHaveBeenCalledWith('dog', undefined);

            channelWrapper.checkQueue('cat');
            expect(channel.checkQueue).toHaveBeenCalledTimes(1);
            expect(channel.checkQueue).toHaveBeenCalledWith('cat');

            channelWrapper.bindQueue('dog', 'bone', '.*');
            expect(channel.bindQueue).toHaveBeenCalledTimes(1);
            expect(channel.bindQueue).toHaveBeenCalledWith('dog', 'bone', '.*', undefined);

            channelWrapper.assertExchange('bone', 'topic');
            expect(channel.assertExchange).toHaveBeenCalledTimes(1);
            expect(channel.assertExchange).toHaveBeenCalledWith('bone', 'topic', undefined);

            channelWrapper.checkExchange('fish');
            expect(channel.checkExchange).toHaveBeenCalledTimes(1);
            expect(channel.checkExchange).toHaveBeenCalledWith('fish');
        });
    });

    it('should proxy assertQueue, assertExchange, bindQueue and unbindQueue to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = getUnderlyingChannel(channelWrapper);

            channelWrapper.assertQueue('dog');
            expect(channel.assertQueue).toHaveBeenCalledTimes(1);
            expect(channel.assertQueue).toHaveBeenCalledWith('dog', undefined);

            channelWrapper.assertExchange('bone', 'topic');
            expect(channel.assertExchange).toHaveBeenCalledTimes(1);
            expect(channel.assertExchange).toHaveBeenCalledWith('bone', 'topic', undefined);

            channelWrapper.bindQueue('dog', 'bone', 'legs');
            expect(channel.bindQueue).toHaveBeenCalledTimes(1);
            expect(channel.bindQueue).toHaveBeenCalledWith('dog', 'bone', 'legs', undefined);

            channelWrapper.unbindQueue('dog', 'bone', 'legs');
            expect(channel.unbindQueue).toHaveBeenCalledTimes(1);
            expect(channel.unbindQueue).toHaveBeenCalledWith('dog', 'bone', 'legs', undefined);
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
        expect(channel.assertQueue).toHaveBeenCalledTimes(1);
        expect(channel.assertQueue).toHaveBeenCalledWith('dog', undefined);

        expect(channel.bindQueue).toHaveBeenCalledTimes(1);
        expect(channel.bindQueue).toHaveBeenCalledWith('dog', 'bone', '.*', undefined);

        expect(channel.assertExchange).toHaveBeenCalledTimes(1);
        expect(channel.assertExchange).toHaveBeenCalledWith('bone', 'topic', undefined);
    });

    it('should ignore assertQueue, bindQueue, assertExchange if we are disconnected', function () {
        const channelWrapper = new ChannelWrapper(connectionManager);
        channelWrapper.assertQueue('dog', { durable: true });
        channelWrapper.bindQueue('dog', 'bone', '.*');
        channelWrapper.assertExchange('bone', 'topic');
    });

    it('should proxy bindExchange, unbindExchange and deleteExchange to the underlying channel', function () {
        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager);
        return channelWrapper.waitForConnect().then(function () {
            // get the underlying channel
            const channel = getUnderlyingChannel(channelWrapper);

            channelWrapper.bindExchange('paris', 'london', '*');
            expect(channel.bindExchange).toHaveBeenCalledTimes(1);
            expect(channel.bindExchange).toHaveBeenCalledWith('paris', 'london', '*', undefined);

            channelWrapper.unbindExchange('paris', 'london', '*');
            expect(channel.unbindExchange).toHaveBeenCalledTimes(1);
            expect(channel.unbindExchange).toHaveBeenCalledWith('paris', 'london', '*', undefined);

            channelWrapper.deleteExchange('chicago');
            expect(channel.deleteExchange).toHaveBeenCalledTimes(1);
            expect(channel.deleteExchange).toHaveBeenCalledWith('chicago', undefined);
        });
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
                expect(channel.close).toHaveBeenCalledTimes(1);

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
                expect(channel.publish).toHaveBeenCalledTimes(1);
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
                channel.publish = vi.fn().mockImplementation(() => true);
                return Promise.resolve();
            },
        });

        await channelWrapper.waitForConnect();
        const p1 = channelWrapper.publish('exchange', 'routingKey', 'msg:1');
        const p2 = channelWrapper.publish('exchange', 'routingKey', 'msg:2');
        await promiseTools.delay(10);

        const channel = getUnderlyingChannel(channelWrapper);
        expect(channel.publish).toHaveBeenCalledTimes(2);
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
                channel.publish = vi
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

    it('should consume messages', async function () {
        let onMessage: any = null;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            async setup(channel: amqplib.ConfirmChannel) {
                channel.consume = vi.fn().mockImplementation((_queue, onMsg, _options) => {
                    onMessage = onMsg;
                    return Promise.resolve({ consumerTag: 'abc' });
                });
            },
        });
        await channelWrapper.waitForConnect();

        const messages: any[] = [];
        await channelWrapper.consume(
            'queue',
            (msg) => {
                messages.push(msg);
            },
            { noAck: true }
        );

        onMessage(1);
        onMessage(2);
        onMessage(3);
        expect(messages).to.deep.equal([1, 2, 3]);
    });

    it('should reconnect consumer on consumer cancellation', async function () {
        let onMessage: any = null;
        let consumerTag = 0;

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            async setup(channel: amqplib.ConfirmChannel) {
                channel.consume = vi.fn().mockImplementation((_queue, onMsg, _options) => {
                    onMessage = onMsg;
                    return Promise.resolve({ consumerTag: `${consumerTag++}` });
                });
            },
        });
        await channelWrapper.waitForConnect();

        const messages: any[] = [];
        await channelWrapper.consume('queue', (msg) => {
            messages.push(msg);
        });

        onMessage(1);
        onMessage(null); // simulate consumer cancel
        onMessage(2);
        onMessage(null); // simulate second cancel
        onMessage(3);

        expect(messages).to.deep.equal([1, 2, 3]);
        expect(consumerTag).to.equal(3);
    });

    it('should reconnect consumers on channel error', async function () {
        let onQueue1: any = null;
        let onQueue2: any = null;
        let consumerTag = 0;

        // Define a prefetch function here, because it will otherwise be
        // unique for each new channel
        const prefetchFn = vi
            .fn()
            .mockImplementation((_prefetch: number, _isGlobal: boolean) => {});

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            async setup(channel: amqplib.ConfirmChannel) {
                channel.prefetch = prefetchFn;
                channel.consume = vi.fn().mockImplementation((queue, onMsg, _options) => {
                    if (queue === 'queue1') {
                        onQueue1 = onMsg;
                    } else {
                        onQueue2 = onMsg;
                    }
                    return Promise.resolve({ consumerTag: `${consumerTag++}` });
                });
            },
        });
        await channelWrapper.waitForConnect();

        const queue1: any[] = [];
        await channelWrapper.consume(
            'queue1',
            (msg) => {
                queue1.push(msg);
            },
            { noAck: true, prefetch: 10 }
        );

        const queue2: any[] = [];
        await channelWrapper.consume('queue2', (msg) => {
            queue2.push(msg);
        });

        onQueue1(1);
        onQueue2(1);

        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        onQueue1(2);
        onQueue2(2);

        expect(queue1).to.deep.equal([1, 2]);
        expect(queue2).to.deep.equal([1, 2]);
        expect(consumerTag).to.equal(4);
        expect(prefetchFn).toHaveBeenCalledTimes(2);
        expect(prefetchFn).toHaveBeenNthCalledWith(1, 10, false);
        expect(prefetchFn).toHaveBeenNthCalledWith(2, 10, false);
    });

    it('should be able to cancel all consumers', async function () {
        let onQueue1: any = null;
        let onQueue2: any = null;
        let consumerTag = 0;
        const canceledTags: number[] = [];

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            async setup(channel: amqplib.ConfirmChannel) {
                channel.consume = vi.fn().mockImplementation((queue, onMsg, _options) => {
                    if (queue === 'queue1') {
                        onQueue1 = onMsg;
                    } else {
                        onQueue2 = onMsg;
                    }
                    return Promise.resolve({ consumerTag: `${consumerTag++}` });
                });
                channel.cancel = vi.fn().mockImplementation((consumerTag) => {
                    canceledTags.push(consumerTag);
                    if (consumerTag === '0') {
                        onQueue1(null);
                    } else if (consumerTag === '1') {
                        onQueue2(null);
                    }
                    return Promise.resolve();
                });
            },
        });
        await channelWrapper.waitForConnect();

        const queue1: any[] = [];
        await channelWrapper.consume('queue1', (msg) => {
            queue1.push(msg);
        });

        const queue2: any[] = [];
        await channelWrapper.consume('queue2', (msg) => {
            queue2.push(msg);
        });

        onQueue1(1);
        onQueue2(1);

        await channelWrapper.cancelAll();

        // Consumers shouldn't be resumed after reconnect when canceled
        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(queue1).to.deep.equal([1]);
        expect(queue2).to.deep.equal([1]);
        expect(consumerTag).to.equal(2);
        expect(canceledTags).to.deep.equal(['0', '1']);
    });

    it('should be able to cancel specific consumers', async function () {
        let onQueue1: any = null;
        let onQueue2: any = null;
        const canceledTags: number[] = [];

        connectionManager.simulateConnect();
        const channelWrapper = new ChannelWrapper(connectionManager, {
            async setup(channel: amqplib.ConfirmChannel) {
                channel.consume = vi.fn().mockImplementation((queue, onMsg, _options) => {
                    if (queue === 'queue1') {
                        onQueue1 = onMsg;
                    } else {
                        onQueue2 = onMsg;
                    }
                    return Promise.resolve({
                        consumerTag: _options.consumerTag,
                    });
                });
                channel.cancel = vi.fn().mockImplementation((consumerTag) => {
                    canceledTags.push(consumerTag);
                    if (consumerTag === '0') {
                        onQueue1(null);
                    } else if (consumerTag === '1') {
                        onQueue2(null);
                    }
                    return Promise.resolve();
                });
            },
        });
        await channelWrapper.waitForConnect();

        const queue1: any[] = [];
        const { consumerTag: consumerTag1 } = await channelWrapper.consume(
            'queue1',
            (msg) => {
                queue1.push(msg);
            },
            { consumerTag: '1' }
        );

        const queue2: any[] = [];
        const { consumerTag: consumerTag2 } = await channelWrapper.consume(
            'queue2',
            (msg) => {
                queue2.push(msg);
            },
            { consumerTag: '2' }
        );

        onQueue1(1);
        onQueue2(1);

        await channelWrapper.cancel(consumerTag1);
        await channelWrapper.cancel(consumerTag2);

        // Consumers shouldn't be resumed after reconnect when canceled
        connectionManager.simulateDisconnect();
        connectionManager.simulateConnect();
        await channelWrapper.waitForConnect();

        expect(queue1).to.deep.equal([1]);
        expect(queue2).to.deep.equal([1]);
        expect(canceledTags).to.deep.equal(['1', '2']);
    });

    it('should not register same consumer twice', async function () {
        const setup = vi.fn().mockImplementation(() => promiseTools.delay(10));

        const channelWrapper = new ChannelWrapper(connectionManager, { setup });
        connectionManager.simulateConnect();

        await channelWrapper.consume('queue', () => {});

        await channelWrapper.waitForConnect();

        const channel = getUnderlyingChannel(channelWrapper);
        expect(channel.consume).toHaveBeenCalledTimes(1);
    });
});

/** Returns the arguments of the most recent call to this mock. */
function lastArgs(mock: Mock): any[] | undefined {
    if (mock.mock.calls.length === 0) {
        return undefined;
    }
    return mock.mock.calls[mock.mock.calls.length - 1];
}

/* eslint-disable @typescript-eslint/no-empty-function */

import { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import chai from 'chai';
import chaiJest from 'chai-jest';
import { once } from 'events';
import { defer, timeout } from 'promise-tools';
import amqp from "../src";
import AmqpConnectionManager from "../src/AmqpConnectionManager";
import {IAmqpConnectionManager} from "../src/decorate";

chai.use(chaiJest);

const { expect } = chai;

describe('Integration tests', () => {
    let connection: IAmqpConnectionManager;

    afterEach(async () => {
        await connection?.close();
    });

    describe('basic broker connection tests', () => {

        it('... as a string', async () => {
            connection = await amqp.connect('amqp://localhost');
            timeout(once(connection, 'connect'), 3000);
            expect(connection.isConnected()).to.be.true
        });

        it('... as an array', async () => {
            connection = await amqp.connect(['amqp://localhost']);
            timeout(once(connection, 'connect'), 3000);
            expect(connection.isConnected()).to.be.true
        });

        it('... array with a username and password', async () => {
            connection = await amqp.connect(['amqp://guest:guest@localhost:5672']);
            timeout(once(connection, 'connect'), 3000);
            expect(connection.isConnected()).to.be.true;
        });

        it('... complex string', async () => {
            connection = await amqp.connect('amqp://guest:guest@localhost:5672');
            timeout(once(connection, 'connect'), 3000);
            expect(connection.isConnected()).to.be.true;
        });

        it('... with a amqp.Connect object', async () => {
            // Create a new connection manager
            connection = await amqp.connect({
                protocol: 'amqp',
                hostname: 'localhost',
                port: 5672,
                vhost: '/',
            });
            timeout(once(connection, 'connect'), 3000);
            expect(connection.isConnected()).to.be.true;
        });

        it('... with an url/options object', async () => {
            // Create a new connection manager
            connection = await amqp.connect({
                url: 'amqp://guest:guest@localhost:5672',
            });
            timeout(once(connection, 'connect'), 3000);
        });

        it('... with a string with options', async () => {
            // Create a new connection manager
            connection = await amqp.connect(
              'amqp://guest:guest@localhost:5672/%2F?heartbeat=10&channelMax=100'
            );
            timeout(once(connection, 'connect'), 3000);
        });

    })

    // This test might cause jest to complain about leaked resources due to the bug described and fixed by:
    // https://github.com/squaremo/amqp.node/pull/584
    it.skip('should throw on awaited connect with wrong password', async () => {
        connection = new AmqpConnectionManager('amqp://guest:wrong@localhost');
        let err;
        try {
            await connection.connect();
        } catch (error: any) {
            err = error;
        }
        expect(err.message).to.contain('ACCESS-REFUSED');
    });

    it.skip('send and receive messages', async () => {
        const queueName = 'testQueue1';
        const content = `hello world - ${Date.now()}`;

        // Create a new connection manager
        connection = await amqp.connect(['amqp://localhost']);

        // Ask the connection manager for a ChannelWrapper.  Specify a setup function to
        // run every time we reconnect to the broker.
        const sendChannel = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
            },
        });

        const rxPromise = defer<ConsumeMessage>();

        const receiveWrapper = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                // `channel` here is a regular amqplib `ConfirmChannel`.
                // Note that `this` here is the channelWrapper instance.
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
                await channel.consume(
                    queueName,
                    (message) => {
                        if (!message) {
                            // Ignore.
                        } else if (message.content.toString() === content) {
                            rxPromise.resolve(message);
                        } else {
                            console.log(
                                `Received message ${message?.content.toString()} !== ${content}`
                            );
                        }
                    },
                    {
                        noAck: true,
                    }
                );
            },
        });

        await timeout(once(connection, 'connect'), 3000);

        await sendChannel.sendToQueue(queueName, content);

        const result = await timeout(rxPromise.promise, 3000);
        expect(result.content.toString()).to.equal(content);

        await sendChannel.close();
        await receiveWrapper.close();
    });

    it.skip('send and receive messages with plain channel', async () => {
        const queueName = 'testQueue2';
        const content = `hello world - ${Date.now()}`;

        connection = new AmqpConnectionManager('amqp://localhost');
        const sendChannel = connection.createChannel({
            confirm: false,
            setup: async (channel: Channel) => {
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
            },
        });

        const receiveChannel = connection.createChannel({
            confirm: false,
            setup: async (channel: Channel) => {
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
            },
        });

        await connection.connect();

        const rxPromise = defer<ConsumeMessage>();
        await receiveChannel.consume(queueName, (message) => {
            rxPromise.resolve(message);
        });

        await sendChannel.sendToQueue(queueName, content);

        const result = await timeout(rxPromise.promise, 3000);
        expect(result.content.toString()).to.equal(content);

        await sendChannel.close();
        await receiveChannel.close();
    });

    it.skip('RPC', async () => {
        const queueName = 'testQueueRpc';

        // Create a new connection manager
        connection = await amqp.connect(['amqp://localhost']);

        let rpcClientQueueName = '';

        const result = defer<string | undefined>();

        // Ask the connection manager for a ChannelWrapper.  Specify a setup function to
        // run every time we reconnect to the broker.
        const rpcClient = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                const qok = await channel.assertQueue('', { exclusive: true });
                rpcClientQueueName = qok.queue;

                await channel.consume(
                    rpcClientQueueName,
                    (message) => {
                        result.resolve(message?.content.toString());
                    },
                    { noAck: true }
                );
            },
        });

        const rpcServer = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
                await channel.prefetch(1);
                await channel.consume(
                    queueName,
                    (message) => {
                        if (message) {
                            channel.sendToQueue(message.properties.replyTo, Buffer.from('world'), {
                                correlationId: message.properties.correlationId,
                            });
                        }
                    },
                    { noAck: true }
                );
            },
        });

        await timeout(once(connection, 'connect'), 3000);
        await timeout(rpcClient.waitForConnect(), 3000);
        await timeout(rpcServer.waitForConnect(), 3000);

        // Send message from client to server.
        await rpcClient.sendToQueue(queueName, 'hello', {
            correlationId: 'test',
            replyTo: rpcClientQueueName,
            messageId: 'asdkasldk',
        });

        const reply = await result.promise;
        expect(reply).to.equal('world');

        await rpcClient.close();
        await rpcServer.close();
    });

    it.skip('direct-reply-to', async () => {
        // See https://www.rabbitmq.com/direct-reply-to.html
        const rpcClientQueueName = 'amq.rabbitmq.reply-to';
        const queueName = 'testQueueRpc';

        // Create a new connection manager
        connection = await amqp.connect(['amqp://localhost']);

        const result = defer<string | undefined>();

        connection.on('disconnect', ({ err }) => {
            if (err) {
                console.log(err);
            }
        });

        // Ask the connection manager for a ChannelWrapper.  Specify a setup function to
        // run every time we reconnect to the broker.
        const rpcClient = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                await channel.consume(
                    rpcClientQueueName,
                    (message) => {
                        result.resolve(message?.content.toString());
                    },
                    { noAck: true }
                );
            },
        });

        const rpcServer = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
                await channel.prefetch(1);
                await channel.consume(
                    queueName,
                    (message) => {
                        if (message) {
                            channel.sendToQueue(message.properties.replyTo, Buffer.from('world'), {
                                correlationId: message.properties.correlationId,
                            });
                        }
                    },
                    { noAck: true }
                );
            },
        });

        await timeout(once(connection, 'connect'), 3000);
        await timeout(rpcServer.waitForConnect(), 3000);
        await timeout(rpcClient.waitForConnect(), 3000);

        // Send message from client to server.
        await rpcClient.sendToQueue(queueName, 'hello', {
            correlationId: 'test',
            replyTo: rpcClientQueueName,
            messageId: 'asdkasldk',
        });

        const reply = await result.promise;
        expect(reply).to.equal('world');

        await rpcClient.close();
        await rpcServer.close();
    });

    it.skip('should reconnect consumer after queue deletion', async function () {
        const queueName = 'testQueue';

        connection = new AmqpConnectionManager('amqp://localhost', { connectionOptions: { reconnectTimeInSeconds: 0.5 } });
        const channelWrapper = connection.createChannel({
            confirm: true,
            setup: async (channel: Channel) => {
                await channel.assertQueue(queueName, { durable: false, autoDelete: true });
            },
        });

        const result = defer<string>();
        await channelWrapper.consume(queueName, (msg) => {
            result.resolve(msg.content.toString());
        });

        await Promise.all([connection.connect(), once(channelWrapper, 'connect')]);

        // The deleted queue should cause a reconnect
        await channelWrapper.deleteQueue(queueName);

        // Await all setup functions to run before sending a message
        await once(channelWrapper, 'connect');
        await channelWrapper.sendToQueue(queueName, 'hello');

        const content = await result.promise;
        expect(content).to.equal('hello');
    });
});

import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import chai from 'chai';
import chaiJest from 'chai-jest';
import pEvent from 'p-event';
import { defer, timeout } from 'promise-tools';
import amqp from '../src';
import { IAmqpConnectionManager } from '../src/AmqpConnectionManager';

chai.use(chaiJest);

const { expect } = chai;

/**
 * Tests in this file assume you have a RabbitMQ instance running on localhost.
 * You can start one with:
 *
 *   docker-compose up -d
 *
 */
describe('Integration tests', () => {
    let connection: IAmqpConnectionManager;

    afterEach(async () => {
        await connection?.close();
    });

    it('should connect to the broker', async () => {
        // Create a new connection manager
        connection = amqp.connect(['amqp://localhost']);
        await timeout(pEvent(connection, 'connect'), 3000);
    });

    it('should connect to the broker with a username and password', async () => {
        // Create a new connection manager
        connection = amqp.connect(['amqp://guest:guest@localhost:5672']);
        await timeout(pEvent(connection, 'connect'), 3000);
    });

    it('should connect to the broker with a string', async () => {
        // Create a new connection manager
        connection = amqp.connect('amqp://guest:guest@localhost:5672');
        await timeout(pEvent(connection, 'connect'), 3000);
    });

    it('should connect to the broker with a amqp.Connect object', async () => {
        // Create a new connection manager
        connection = amqp.connect({
            protocol: 'amqp',
            hostname: 'localhost',
            port: 5672,
            vhost: '/',
        });
        await timeout(pEvent(connection, 'connect'), 3000);
    });

    it('should connect to the broker with an url/options object', async () => {
        // Create a new connection manager
        connection = amqp.connect({
            url: 'amqp://guest:guest@localhost:5672',
        });
        await timeout(pEvent(connection, 'connect'), 3000);
    });

    it('should connect to the broker with a string with options', async () => {
        // Create a new connection manager
        connection = amqp.connect(
            'amqp://guest:guest@localhost:5672/%2F?heartbeat=10&channelMax=100'
        );
        await timeout(pEvent(connection, 'connect'), 3000);
    });

    it('send and receive messages', async () => {
        const queueName = 'testQueue1';
        const content = `hello world - ${Date.now()}`;

        // Create a new connection manager
        connection = amqp.connect(['amqp://localhost']);

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

        await timeout(pEvent(connection, 'connect'), 3000);

        await sendChannel.sendToQueue(queueName, content);

        const result = await timeout(rxPromise.promise, 3000);
        expect(result.content.toString()).to.equal(content);

        await sendChannel.close();
        await receiveWrapper.close();
    });

    it('RPC', async () => {
        const queueName = 'testQueueRpc';

        // Create a new connection manager
        connection = amqp.connect(['amqp://localhost']);

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

        await timeout(pEvent(connection, 'connect'), 3000);
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

    it('direct-reply-to', async () => {
        // See https://www.rabbitmq.com/direct-reply-to.html
        const rpcClientQueueName = 'amq.rabbitmq.reply-to';
        const queueName = 'testQueueRpc';

        // Create a new connection manager
        connection = amqp.connect(['amqp://localhost']);

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

        await timeout(pEvent(connection, 'connect'), 3000);
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
});

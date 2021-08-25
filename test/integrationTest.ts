import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import chai from 'chai';
import chaiJest from 'chai-jest';
import pEvent from 'p-event';
import { defer, timeout } from 'promise-tools';
import amqp from '../src';

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
    beforeEach(() => {
        // TODO: Uncomment this if you're using `jest.spyOn()` to restore mocks between tests
        // jest.restoreAllMocks();
    });

    it('should connect to the broker', async () => {
        // Create a new connection manager
        const connection = amqp.connect(['amqp://localhost']);
        await timeout(pEvent(connection, 'connect'), 3000);
        await connection.close();
    });

    it('send and receive messages', async () => {
        const queueName = 'testQueue1';
        const content = `hello world - ${Date.now()}`;

        // Create a new connection manager
        const connection = amqp.connect(['amqp://localhost']);

        // Ask the connection manager for a ChannelWrapper.  Specify a setup function to
        // run every time we reconnect to the broker.
        const sendChannel = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                await channel.assertQueue(queueName, { durable: false });
            },
        });

        const rxPromise = defer<ConsumeMessage>();

        const receiveWrapper = connection.createChannel({
            setup: async (channel: ConfirmChannel) => {
                // `channel` here is a regular amqplib `ConfirmChannel`.
                // Note that `this` here is the channelWrapper instance.
                await channel.assertQueue(queueName, { durable: false });
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

        await sendChannel.sendToQueue(queueName, content);

        const result = await timeout(rxPromise.promise, 3000);
        expect(result.content.toString()).to.equal(content);

        await sendChannel.close();
        await receiveWrapper.close();
        await connection.close();
    });
});

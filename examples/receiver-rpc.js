const amqp = require('..');

const QUEUE_NAME = 'rpc';

// Create a connection manager
const connection = amqp.connect(['amqp://localhost']);
connection.on('connect', function () {
    console.log('Connected!');
});
connection.on('disconnect', function (err) {
    console.log('Disconnected.', err.stack);
});

/**
 * Credit https://github.com/abernov/amqp-connection-manager-rpc
 * This is an NPM focused on creating an RPC Client/Server
 */

function createRPCServer(queue_name, callback, options) {
    const channelWrapper = connection.createChannel({
        json: true,
        setup: (channel) => {
            return new Promise(async function (resolve, reject) {
                try {
                    let queue;
                    if (!options || typeof options.setup !== 'function') {
                        channel.prefetch(1);
                        await channel.assertQueue(queue_name, {
                            durable: false,
                        });
                        queue = queue_name;
                    } else {
                        queue = await options.setup(channel);
                    }
                    channel.consume(queue, async function (msg) {
                        try {
                            let reply = {};
                            try {
                                let message = JSON.parse(msg.content.toString());
                                reply.msg = await callback(message, msg);
                            } catch (err) {
                                reply.err = err.stack;
                            }
                            let exchangeName = '';
                            await channelWrapper.publish(
                                exchangeName,
                                msg.properties.replyTo,
                                reply,
                                {
                                    correlationId: msg.properties.correlationId,
                                }
                            );
                        } catch (err) {
                            console.error('RPCServer, consume exception: ', err);
                        }
                        channel.ack(msg);
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        },
    });
    return channelWrapper;
}

const channelWrapper = createRPCServer(QUEUE_NAME, doRpcJob);

async function doRpcJob(msgJson, msg) {
    // msgJson: This is the "msg" already parsed
    // msg: This is the encoded "msg" that would have to be decoded from a Buffer.
    return msgJson.add + 1;
}

channelWrapper.waitForConnect().then(async function () {
    console.log('Connected to RPC channel.');
});

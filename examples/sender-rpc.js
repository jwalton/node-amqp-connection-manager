const amqp = require('..');
const { randomUUID } = require('crypto');
const NodeCache = require('node-cache');

const QUEUE_NAME = 'rpc';

// Create a connection manager
const connection = amqp.connect(['amqp://localhost']);
connection.on('connect', function () {
    console.log('Connected!');
});
connection.on('disconnect', function (err) {
    console.log('Disconnected.');
});

/**
 * Credit https://github.com/abernov/amqp-connection-manager-rpc
 * This is an NPM focused on creating an RPC Client/Server
 */

async function getResponse(channelWrapper, corr, ttl) {
    console.log(channelWrapper, corr, ttl);
    return new Promise((resolve, reject) => {
        if (!channelWrapper.cache) {
            let checkPeriod = Math.floor(channelWrapper.ttl / 5);
            if (!checkPeriod) {
                checkPeriod = 1;
            }
            let cache = new NodeCache({
                stdTTL: channelWrapper.ttl,
                checkPeriod: checkPeriod,
            });
            cache.on('expired', (key, value) => {
                value.reject(new Error('Time Expired'));
            });
            channelWrapper.cache = cache;
        }
        channelWrapper.cache.set(
            corr,
            {
                resolve,
                reject,
            },
            ttl
        );
        if (ttl !== undefined) {
            channelWrapper.cache.ttl(corr, ttl);
        }
    });
}

function createRPCClient(queue_name = '', ttl = 0, setup) {
    let channelWrapper = connection.createChannel({
        json: true,
        setup: function (channel) {
            channelWrapper.ttl = ttl;
            return new Promise(async function (resolve, reject) {
                try {
                    let queue;
                    if (typeof setup !== 'function') {
                        queue = await channel.assertQueue('', { exclusive: true });
                    } else {
                        queue = await setup(channel);
                    }

                    channelWrapper.sendRPC = async function (
                        msg,
                        ttl,
                        exchangeName = '',
                        routingKey = queue_name
                    ) {
                        let corr = randomUUID();
                        channelWrapper.corr = corr;
                        await channelWrapper.publish(exchangeName, routingKey, msg, {
                            correlationId: corr,
                            replyTo: queue.queue,
                            expiration: (ttl !== undefined ? ttl : channelWrapper.ttl) * 1000,
                        });
                        return await getResponse(channelWrapper, corr, channelWrapper.ttl);
                    };

                    channel.consume(
                        queue.queue,
                        function (msg) {
                            let cache = channelWrapper.cache;
                            if (cache) {
                                let value = cache.get(msg.properties.correlationId);
                                if (value) {
                                    cache.del(msg.properties.correlationId);
                                    try {
                                        let json = JSON.parse(msg.content.toString());
                                        if (json.err) {
                                            value.reject(json.err);
                                        } else {
                                            value.resolve(json.msg);
                                        }
                                    } catch (err) {
                                        value.reject(err);
                                    }
                                }
                            }
                        },
                        {
                            noAck: true,
                        }
                    );

                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        },
    });

    if (channelWrapper.sendRPC === null) {
        channelWrapper.sendRPC = async () => {
            throw new Error('Channel Not Ready');
        };
    }

    return channelWrapper;
}

const ttl = 60;
const channelWrapper = createRPCClient(QUEUE_NAME, ttl);

channelWrapper
    .waitForConnect()
    .then(async function () {
        console.log('Connected to RPC Client Channel.');

        let req = { add: 1 };
        try {
            let prc_reply = await channelWrapper.sendRPC(req);
            console.log('RPC reply: ', prc_reply);
        } catch (err) {
            console.log('RPC error: ', err);
        }
    })
    .finally(function () {
        channelWrapper.close();
    });

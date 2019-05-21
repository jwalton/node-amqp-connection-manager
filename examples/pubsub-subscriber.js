const amqp = require('..');

const QUEUE_NAME = 'amqp-connection-manager-sample2'
const EXCHANGE_NAME = 'amqp-connection-manager-sample2-ex';

// Handle an incomming message.
const onMessage = data => {
    var message = JSON.parse(data.content.toString());
    console.log("subscriber: got message", message);
    channelWrapper.ack(data);
}

// Create a connetion manager
const connection = amqp.connect(['amqp://localhost']);
connection.on('connect', () => console.log('Connected!'));
connection.on('disconnect', err => console.log('Disconnected.', err.stack));

// Set up a channel listening for messages in the queue.
var channelWrapper = connection.createChannel({
    setup: channel =>
        // `channel` here is a regular amqplib `ConfirmChannel`.
        Promise.all([
            channel.assertQueue(QUEUE_NAME, { exclusive: true, autoDelete: true }),
            channel.assertExchange(EXCHANGE_NAME, 'topic'),
            channel.prefetch(1),
            channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '#'),
            channel.consume(QUEUE_NAME, onMessage)
        ])
});

channelWrapper.waitForConnect()
.then(function() {
    console.log("Listening for messages");
});

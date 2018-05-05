var amqp = require('..');

var QUEUE_NAME = 'amqp-connection-manager-sample1'

// Handle an incomming message.
var onMessage = function(data) {
    var message = JSON.parse(data.content.toString());
    console.log("receiver: got message", message);
    channelWrapper.ack(data);
}

// Create a connetion manager
var connection = amqp.connect(['amqp://localhost'], {json: true});
connection.on('connect', function() {
    console.log('Connected!');
});
connection.on('disconnect', function(params) {
    console.log('Disconnected.', params.err.stack);
});

// Set up a channel listening for messages in the queue.
var channelWrapper = connection.createChannel({
    setup: function(channel) {
        // `channel` here is a regular amqplib `ConfirmChannel`.
        return Promise.all([
            channel.assertQueue(QUEUE_NAME, {durable: true}),
            channel.prefetch(1),
            channel.consume(QUEUE_NAME, onMessage)
        ]);
    }
});

channelWrapper.waitForConnect()
.then(function() {
    console.log("Listening for messages");
});

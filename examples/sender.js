var amqp = require('..');
var wait = require('../lib/helpers').wait;

var QUEUE_NAME = 'amqp-connection-manager-sample1'

// Create a connetion manager
var connection = amqp.connect(['amqp://localhost']);
connection.on('connect', function() {
    console.log('Connected!');
});
connection.on('disconnect', function(err) {
    console.log('Disconnected.', err.stack);
});

// Create a channel wrapper
var channelWrapper = connection.createChannel({
    json: true,
    setup: function(channel) {
        // `channel` here is a regular amqplib `ConfirmChannel`.
        return channel.assertQueue(QUEUE_NAME, {durable: true});
    }
});

// Send messages until someone hits CTRL-C or something goes wrong...
var sendMessage = function() {
    channelWrapper.sendToQueue(QUEUE_NAME, {time: Date.now()})
    .then(function() {
        console.log("Message sent");
        return wait(1000);
    })
    .then(function() {
        return sendMessage();
    }).catch(function(err) {
        console.log("Message was rejected:", err.stack);
        channelWrapper.close();
        connection.close();
    });
};

console.log("Sending messages...");
sendMessage();

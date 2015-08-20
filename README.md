Connection management for amqplib.

amqp-connection-manager
=======================

Features:
---------

* Automatically reconnect when your amqplib broker dies in a fire.
* Round-robin connections between multiple brokers in a cluster.
* Presever messages sent while the broken is unavailable.
* Supports both promises and callbacks (using [promise-breaker](https://github.com/jwalton/node-promise-breaker))
* Very un-opinionated library - a thin wrapper around amqplib.

Installation:
-------------

    npm install --save amqp-connection-manager

Basics:
-------

The basic idea here is that, usually, when you create a new channel, you do some setup work at the beginning (like
asserting that various queues or exchanges exist, or binding to queues), and then you send and receive messages and
you never touch that stuff again.

amqp-connection-manager will reconnect to a new broker whenever the broker it is currently connected to dies.  When you
ask amqp-connection-manager for a channel, you specify a `setup` function to run; the setup function will be run every
time amqp-connection-manager reconnects.

For example:

    var amqp = require('amqp-connection-manager');

    var connection = amqp.connect(['amqp://localhost'], {json: true});
    var channelWrapper = connection.createChannel({
        setup: function(channel) {
            // `channel` here is a regular amqplib `ConfirmChannel`.
            return channel.assertQueue('rxQueueName', {durable: true}),
        }
    });

    channelWrapper.sendToQueue('rxQueueName', {hello: 'world'})
    .then(function() {
      return console.log("Message was sent!  Hooray!");
    }).catch(function(err) {
      return console.log("Message was rejected...  Boo!");
    });


API:
----

### connect(urls, options)
Creates a new AmqpConnectionManager, which will connect to one of the URLs provided in `urls`.  If a broker is
unreachable or dies, then AmqpConnectionManager will try the next available broker, round-robin.

Options:
* `options.heartbeatIntervalInSeconds` - Interval to send heartbeats to broker.  Defaults to 5 seconds.


### AmqpConnectionManager events
* `connect({connection, url})` - Emitted whenever we successfully connect to a broker.
* `disconnect({err})` - Emitted whenever we disconnect from a broker.


### AmqpConnectionManager#createChannel(options)
Create a new ChannelWrapper.  This is a proxy for the actual channel (which may or may not exist at any moment,
depending on whether or not we are currently connected.)

Options:
* `options.name` - Name for this channel.  Used for debugging.
* `options.setup(channel, [cb])` - A function to call whenever we reconnect to the broker (and therefore create a new
  underlying channel.)  This function should either accept a callback, or return a Promise.  See `addSetup` below.
* `options.json` if true, then ChannelWrapper assumes all messages passed to `publish()` and `sendToQueue()`
   are plain JSON objects.  These will be encoded automatically before being sent.


### AmqpConnectionManager#isConnected()
Returns true if the AmqpConnectionManager is connected to a broker, false otherwise.


### ChannelWrapper events
* `connect` - emitted every time this channel connects or reconnects.
* `error(err, {name})` - emitted if an error occurs setting up the channel.
* `drop({message, err})` - called when a JSON message was dropped because it could not be encoded.


### ChannelWrapper#addSetup(setup)
Adds a new 'setup handler'.

`setup(channel, [cb])` is a function to call when a new underlying channel is created - handy for asserting
exchanges and queues exists, and whatnot.  The `channel` object here is a ConfigChannel from amqplib.
The `setup` function should return a Promise (or optionally take a callback) - no messages will be sent until
this promise resolves.

If there is a connection, `setup()` will be run immediately, and the addSetup promise/callback won't resolve
until `setup` is complete.

Setup functions should, ideally, not throw errors, but if they do then the ChannelWrapper will emit an 'error' event.


### ChannelWrapper#removeSetup(setup, teardown)
Removes a setup handler.  If the channel is currently connected, will call `teardown(channel)`, passing in the
underlying amqplib ConfirmChannel.  `teardown` should either take a callback or return a Promise.


### ChannelWrapper#publish and ChannelWrapper#sendToQueue
These work exactly like their counterparts in amqplib's Channel, except that they return a Promise (or accept a
callback) which resolves when the message is confirmed to have been delivered to the broker.  The promise rejects if
either the broker refuses the message, or if `close()` is called on the ChannelWrapper before the message can be
delivered.


### ChannelWrapper#ack and ChannelWrapper#nack
These are just aliases for calling `ack()` and `nack()` on the underlying channel.  They do nothing if the underlying
channel is not connected.

### ChannelWrapper#queueLength()
Returns a count of messages currently waiting to be sent to the underlying channel.

### ChannelWrapper#close()
Close a channel, clean up resources associated with it.

[![Build Status](https://travis-ci.org/benbria/node-amqp-connection-manager.svg?branch=master)](https://travis-ci.org/benbria/node-amqp-connection-manager)
[![Coverage Status](https://coveralls.io/repos/benbria/node-amqp-connection-manager/badge.svg?branch=master&service=github)](https://coveralls.io/github/benbria/node-amqp-connection-manager?branch=master)

[![Dependency Status](https://david-dm.org/benbria/node-amqp-connection-manager.svg)](https://david-dm.org/benbria/node-amqp-connection-manager)
[![devDependency Status](https://david-dm.org/benbria/node-amqp-connection-manager/dev-status.svg)](https://david-dm.org/benbria/node-amqp-connection-manager#info=devDependencies)
[![peerDependency Status](https://david-dm.org/benbria/node-amqp-connection-manager/peer-status.svg)](https://david-dm.org/benbria/node-amqp-connection-manager#info=peerDependencies)

Connection management for amqplib.

amqp-connection-manager
=======================

Features:
---------

* Automatically reconnect when your amqplib broker dies in a fire.
* Round-robin connections between multiple brokers in a cluster.
* If messages are sent while the broker is unavailable, queues messages in memory until we reconnect.
* Supports both promises and callbacks (using [promise-breaker](https://github.com/jwalton/node-promise-breaker))
* Very un-opinionated library - a thin wrapper around amqplib.

Installation:
-------------

    npm install --save amqplib amqp-connection-manager

Basics:
-------

The basic idea here is that, usually, when you create a new channel, you do some setup work at the beginning (like
asserting that various queues or exchanges exist, or binding to queues), and then you send and receive messages and
you never touch that stuff again.

amqp-connection-manager will reconnect to a new broker whenever the broker it is currently connected to dies.  When you
ask amqp-connection-manager for a channel, you specify one or more `setup` functions to run; the setup functions will
be run every time amqp-connection-manager reconnects, to make sure your channel and broker are in a sane state.

Before we get into an example, note this example is written using Promises, however much like amqplib, any
function which returns a Promise will also accept a callback as an optional parameter.

Here's the example:

    var amqp = require('amqp-connection-manager');

    // Create a new connection manager
    var connection = amqp.connect(['amqp://localhost'], {json: true});

    // Ask the connection manager for a ChannelWrapper.  Specify a setup function to run every time we reconnect
    // to the broker.
    var channelWrapper = connection.createChannel({
        setup: function(channel) {
            // `channel` here is a regular amqplib `ConfirmChannel`.
            return channel.assertQueue('rxQueueName', {durable: true}),
        }
    });

    // Send some messages to the queue.  If we're not currently connected, these will be queued up in memory
    // until we connect.  Note that `sendToQueue()` and `publish()` return a Promise which is fulfilled or rejected
    // when the message is actually sent (or not sent.)
    channelWrapper.sendToQueue('rxQueueName', {hello: 'world'})
    .then(function() {
      return console.log("Message was sent!  Hooray!");
    }).catch(function(err) {
      return console.log("Message was rejected...  Boo!");
    });

Sometimes it's handy to modify a channel at run time.  For example, suppose you have a channel that's listening to
one kind of message, and you decide you now also want to listen to some other kind of message.  This can be done
by adding a new setup function to an existing ChannelWrapper:

    channelWrapper.addSetup(function(channel) {
        Promise.all([
            channel.assertQueue("my-queue", { exclusive: true, autoDelete: true }),
            channel.bindQueue("my-queue", "my-exchange", "create"),
            channel.consume("my-queue", handleMessage)
        ])
    });

`addSetup()` returns a Promise which resolves when the setup function is finished (or immediately, if the underlying
connection is not currently connected to a broker.)  There is also a `removeSetup(setup, teardown)` which will run
`teardown(channel)` if the channel is currently connected to a broker (and will not run `teardown` at all otherwise.)
Note that `setup` and `teardown` *must* either accept a callback or return a Promise.

See a complete example in the [examples](./examples) folder.

API:
----

### connect(urls, options)
Creates a new AmqpConnectionManager, which will connect to one of the URLs provided in `urls`.  If a broker is
unreachable or dies, then AmqpConnectionManager will try the next available broker, round-robin.

Options:
* `options.heartbeatIntervalInSeconds` - Interval to send heartbeats to broker.  Defaults to 5 seconds.
* `options.reconnectTimeInSeconds` - The time to wait before trying to reconnect.  If not specified,
  defaults to `heartbeatIntervalInSeconds`.
* `options.findServers(callback)` is a function which returns one or more servers to connect to.  This should
  return either a single URL or an array of URLs.  This is handy when you're using a service discovery mechanism
  such as Consul or etcd.  Instead of taking a `callback`, this can also return a Promise.  Note that if this
  is supplied, then `urls` is ignored.
* `options.connectionOptions` is passed as options to the amqplib connect method.

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


### AmqpConnectionManager#close()
Close this AmqpConnectionManager and free all associated resources.


### ChannelWrapper events
* `connect` - emitted every time this channel connects or reconnects.
* `error(err, {name})` - emitted if an error occurs setting up the channel.
* `drop({message, err})` - called when a JSON message was dropped because it could not be encoded.
* `close` - emitted when this channel closes via a call to `close()`


### ChannelWrapper#addSetup(setup)
Adds a new 'setup handler'.

`setup(channel, [cb])` is a function to call when a new underlying channel is created - handy for asserting
exchanges and queues exists, and whatnot.  The `channel` object here is a ConfigChannel from amqplib.
The `setup` function should return a Promise (or optionally take a callback) - no messages will be sent until
this Promise resolves.

If there is a connection, `setup()` will be run immediately, and the addSetup Promise/callback won't resolve
until `setup` is complete.  Note that in this case, if the setup throws an error, no 'error' event will
be emitted, since you can just handle the error here (although the `setup` will still be added for future
reconnects, even if it throws an error.)

Setup functions should, ideally, not throw errors, but if they do then the ChannelWrapper will emit an 'error'
event.


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

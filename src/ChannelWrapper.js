import { EventEmitter } from 'events';
import pb from 'promise-breaker';
import DiskArray from '@trusk/array-to-disk';

/**
 *  Calls to `publish()` or `sendToQueue()` work just like in amqplib, but messages are queued internally and
 * are guaranteed to be delivered.  If the underlying connection drops, ChannelWrapper will wait for a new
 * connection and continue.
 *
 * Events:
 * * `connect` - emitted every time this channel connects or reconnects.
 * * `error(err, {name})` - emitted if an error occurs setting up the channel.
 * * `drop({message, err})` - called when a JSON message was dropped because it could not be encoded.
 * * `close` - emitted when this channel closes via a call to `close()`
 *
 */
export default class ChannelWrapper extends EventEmitter {
    /**
     *  Adds a new 'setup handler'.
     *
     * `setup(channel, [cb])` is a function to call when a new underlying channel is created - handy for asserting
     * exchanges and queues exists, and whatnot.  The `channel` object here is a ConfigChannel from amqplib.
     * The `setup` function should return a Promise (or optionally take a callback) - no messages will be sent until
     * this Promise resolves.
     *
     * If there is a connection, `setup()` will be run immediately, and the addSetup Promise/callback won't resolve
     * until `setup` is complete.  Note that in this case, if the setup throws an error, no 'error' event will
     * be emitted, since you can just handle the error here (although the `setup` will still be added for future
     * reconnects, even if it throws an error.)
     *
     * Setup functions should, ideally, not throw errors, but if they do then the ChannelWrapper will emit an 'error'
     * event.
     *
     * @param {function} setup - setup function.
     * @param {function} [done] - callback.
     * @returns {void | Promise} - Resolves when complete.
     */
    addSetup(setup, done=null) {
        return pb.addCallback(done,
            (this._settingUp || Promise.resolve())
            .then(() => {
                this._setups.push(setup);
                if(this._channel) {
                    return pb.call(setup, this, this._channel);
                } else {
                    return undefined;
                }
            })
        );
    }

    /**
     * Remove a setup function added with `addSetup`.  If there is currently a
     * connection, `teardown(channel, [cb])` will be run immediately, and the
     * returned Promise will not resolve until it completes.
     *
     * @param {function} setup - the setup function to remove.
     * @param {function} [teardown] - `function(channel, [cb])` to run to tear
     *   down the chanel.
     * @param {function} [done] - Optional callback.
     * @returns {void | Promise} - Resolves when complete.
     */
    removeSetup(setup, teardown=null, done=null) {
        return pb.addCallback(done, () => {
            this._setups = this._setups.filter(s => s !== setup);

            return (this._settingUp || Promise.resolve())
            .then(() => this._channel
                ? pb.call(teardown, this, this._channel)
                : undefined
            );
        });
    }

    /**
     * Returns a Promise which resolves when this channel next connects.
     * (Mainly here for unit testing...)
     *
     * @param {function} [done] - Optional callback.
     * @returns {void | Promise} - Resolves when connected.
     */
    waitForConnect(done=null) {
        return pb.addCallback(done,
            (this._channel && !this._settingUp)
                ? Promise.resolve()
                : new Promise(resolve => this.once('connect', resolve))
        );
    }

    /*
     * Publish a message to the channel.
     *
     * This works just like amqplib's `publish()`, except if the channel is not
     * connected, this will wait until the channel is connected.  Returns a
     * Promise which will only resolve when the message has been succesfully sent.
     * The returned promise will be rejected if `close()` is called on this
     * channel before it can be sent, if `options.json` is set and the message
     * can't be encoded, or if the broker rejects the message for some reason.
     *
     */
    publish(exchange, routingKey, content, options, done=null) {
        return pb.addCallback(done, new Promise((resolve, reject) => {
            this._messages.push({
                type: 'publish',
                exchange,
                routingKey,
                content,
                options,
                resolve,
                reject
            });
            this._startWorker();
        }));
    }

    /*
     * Send a message to a queue.
     *
     * This works just like amqplib's `sendToQueue`, except if the channel is not connected, this will wait until the
     * channel is connected.  Returns a Promise which will only resolve when the message has been succesfully sent.
     * The returned promise will be rejected only if `close()` is called on this channel before it can be sent.
     *
     * `message` here should be a JSON-able object.
     */
    sendToQueue(queue, content, options, done=null) {
        return pb.addCallback(done, new Promise((resolve, reject) => {
            this._messages.push({
                type: 'sendToQueue',
                queue,
                content,
                options,
                resolve,
                reject
            });
            return this._startWorker();
        }));
    }

    /**
     * Create a new ChannelWrapper.
     *
     * @param {AmqpConnectionManager} connectionManager - connection manager which
     *   created this channel.
     * @param {Object} [options] -
     * @param {string} [options.name] - A name for this channel.  Handy for debugging.
     * @param {function} [options.setup] - A default setup function to call.  See
     *   `addSetup` for details.
     * @param {boolean} [options.json] - if true, then ChannelWrapper assumes all
     *   messages passed to `publish()` and `sendToQueue()` are plain JSON objects.
     *   These will be encoded automatically before being sent.
     *
     */
    constructor(connectionManager, options = {}) {
        super();
        this._onConnect = this._onConnect.bind(this);
        this._onDisconnect = this._onDisconnect.bind(this);
        this._connectionManager = connectionManager;
        this.name = options.name;

        this.context = {};

        this._json = ('json' in options) ? options.json : false;

        // Place to store queued messages.
        this._messages = new DiskArray(options.swap_path, options.swap_size);
        const messages_to_republish = [];
        while (this._messages.length) {
          messages_to_republish.push(this._messages.shift());
        }
        while (messages_to_republish.length) {
          const args = [
            messages_to_republish[0].exchange || messages_to_republish[0].queue,
            messages_to_republish[0].routingKey,
            messages_to_republish[0].content,
            messages_to_republish[0].options
          ];
          this[messages_to_republish[0].type](...args);
          messages_to_republish.shift();
        }

        // Place to store published, but not yet confirmed messages
        this._unconfirmedMessages = [];

        // True if the "worker" is busy sending messages.  False if we need to
        // start the worker to get stuff done.
        this._working = false;

        // If we're in the process of creating a channel, this is a Promise which
        // will resolve when the channel is set up.  Otherwise, this is `null`.
        this._settingUp = null;

        // The currently connected channel.  Note that not all setup functions
        // have been run on this channel until `@_settingUp` is either null or
        // resolved.
        this._channel = null;

        // We kill off workers when we disconnect.  Whenever we start a new
        // worker, we bump up the `_workerNumber` - this makes it so if stale
        // workers ever do wake up, they'll know to stop working.
        this._workerNumber = 0;

        // Array of setup functions to call.
        this._setups = [];
        if(options.setup) {
            this._setups.push(options.setup);
        }

        if(connectionManager.isConnected()) {
            this._onConnect({
                connection: this._connectionManager._currentConnection
            });
        }
        connectionManager.on('connect', this._onConnect);
        connectionManager.on('disconnect', this._onDisconnect);
    }

    // Called whenever we connect to the broker.
    _onConnect({ connection }) {
        this._connection = connection;

        return connection.createConfirmChannel()
        .then(channel => {
            this._channel = channel;
            channel.on('close', () => this._onChannelClose(channel));

            this._settingUp = Promise.all(
                this._setups.map(setupFn =>
                    // TODO: Use a timeout here to guard against setupFns that never resolve?
                    pb.call(setupFn, this, channel)
                    .catch(err => {
                        if(this._channel) {
                            this.emit('error', err, { name: this.name });
                        } else {
                            // Don't emit an error if setups failed because the channel was closing.
                        }
                    })
                )

            )
            .then(() => {
                this._settingUp = null;
                return this._channel;
            });

            return this._settingUp;
        })
        .then(() => {
            if(!this._channel) {
                // Can happen if channel closes while we're setting up.
                return;
            }
            if (this._unconfirmedMessages.length > 0) {
                // requeu any messages that were left unconfirmed when connection was lost
                while (this._unconfirmedMessages.length) {
                    this._messages.push(this._unconfirmedMessages.shift());
                }
            }

            // Since we just connected, publish any queued messages
            this._startWorker();
            this.emit('connect');
        })
        .catch(err => {
            this.emit('error', err, { name: this.name });
            this._settingUp = null;
            this._channel = null;
        });
    }

    // Called whenever the channel closes.
    _onChannelClose(channel) {
        if(this._channel === channel) {
            this._channel = null;
        }
    }
    // Wait for another reconnect to create a new channel.

    // Called whenever we disconnect from the AMQP server.
    _onDisconnect() {
        this._channel = null;
        this._settingUp = null;

        // Kill off the current worker.  We never get any kind of error for messages in flight - see
        // https://github.com/squaremo/amqp.node/issues/191.
        this._working = false;
    }

    // Returns the number of unsent messages queued on this channel.
    queueLength() {
        return this._messages.length;
    }

    // Destroy this channel.
    //
    // Any unsent messages will have their associated Promises rejected.
    //
    close() {
        return Promise.resolve()
        .then(() => {
            this._working = false;
            if(this._messages.length !== 0) {
                // Reject any unsent messages.
                this._messages.forEach(message => message.reject(new Error('Channel closed')));
            }
            if(this._unconfirmedMessages.length !== 0) {
                // Reject any unconfirmed messages.
                this._unconfirmedMessages.forEach(message => message.reject(new Error('Channel closed')));
            }

            this._connectionManager.removeListener('connect', this._onConnect);
            this._connectionManager.removeListener('disconnect', this._onDisconnect);
            const answer = (this._channel && this._channel.close()) || undefined;
            this._channel = null;

            this.emit('close');

            return answer;
        });
    }

    _shouldPublish() {
        return (this._messages.length > 0) && !this._settingUp && this._channel;
    }

    // Start publishing queued messages, if there isn't already a worker doing this.
    _startWorker() {
        if(!this._working && this._shouldPublish()) {
            this._working = true;
            this._workerNumber++;
            this._publishQueuedMessages(this._workerNumber);
        }
    }

    _publishQueuedMessages(workerNumber) {
        if(!this._shouldPublish() || !this._working || (workerNumber !== this._workerNumber)) {
            // Can't publish anything right now...
            this._working = false;
            return Promise.resolve();
        }

        const channel = this._channel;
        const message = this._messages.shift();
        this._unconfirmedMessages.push(message);

        Promise.resolve()
        .then(() => {
            const encodedMessage = this._json ? new Buffer.from(JSON.stringify(message.content)) : message.content;

            const sendPromise = (() => {
                switch (message.type) {
                    case 'publish':
                        return new Promise(function(resolve, reject) {
                            const result = channel.publish(message.exchange, message.routingKey, encodedMessage,
                                message.options,
                                err => {
                                    if(err) {
                                        reject(err);
                                    } else {
                                        setImmediate(() => resolve(result));
                                    }
                                });
                        });
                    case 'sendToQueue':
                        return new Promise(function(resolve, reject) {
                            const result = channel.sendToQueue(message.queue, encodedMessage, message.options, err => {
                                if(err) {
                                    reject(err);
                                } else {
                                    setImmediate(() => resolve(result));
                                }
                            });
                        });

                    /* istanbul ignore next */
                    default:
                        throw new Error(`Unhandled message type ${message.type}`);
                }
            })();

            // Send some more!
            this._publishQueuedMessages(workerNumber);

            return sendPromise;
        })
        .then(
            result => {
                this._unconfirmedMessages.shift();
                message.resolve(result);
            },

            err => {
                if(!this._channel) {
                    // Tried to write to a closed channel.  Leave the message in the queue and we'll try again when we
                    // reconnect.
                    this._messages.unshift(this._unconfirmedMessages.shift());
                } else {
                    // Something went wrong trying to send this message - could be JSON.stringify failed, could be the
                    // broker rejected the message.  Either way, reject it back
                    this._unconfirmedMessages.shift();
                    message.reject(err);
                }
            }
        )
        .catch( /* istanbul ignore next */ err => {
            this.emit('error', err);
            this._working = false;
        });

        return null;
    }

    // Send an `ack` to the underlying channel.
    ack() {
        return this._channel && this._channel.ack.apply(this._channel, arguments);
    }

    // Send an `ackAll` to the underlying channel.
    ackAll() {
        return this._channel && this._channel.ackAll.apply(this._channel, arguments);
    }

    // Send a `nack` to the underlying channel.
    nack() {
        return this._channel && this._channel.nack.apply(this._channel, arguments);
    }

    // Send a `nackAll` to the underlying channel.
    nackAll() {
        return this._channel && this._channel.nackAll.apply(this._channel, arguments);
    }
}

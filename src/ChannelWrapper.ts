import * as amqplib from 'amqplib';
import { ConfirmChannel, Options } from 'amqplib';
import { EventEmitter } from 'events';
import pb from 'promise-breaker';
import { IAmqpConnectionManager } from './AmqpConnectionManager.js';

export type SetupFunc =
    | ((channel: ConfirmChannel, callback: (error?: Error) => void) => void)
    | ((channel: ConfirmChannel) => Promise<void>);

export interface CreateChannelOpts {
    /**  Name for this channel. Used for debugging. */
    name?: string;
    /**
     * A function to call whenever we reconnect to the broker (and therefore create a new underlying channel.)
     * This function should either accept a callback, or return a Promise. See addSetup below
     */
    setup?: SetupFunc;
    /**
     * if true, then ChannelWrapper assumes all messages passed to publish() and sendToQueue() are plain JSON objects.
     * These will be encoded automatically before being sent.
     */
    json?: boolean;
}

interface PublishMessage {
    type: 'publish';
    exchange: string;
    routingKey: string;
    content: Buffer | string | unknown;
    options: amqplib.Options.Publish | undefined;
    resolve: (result: boolean) => void;
    reject: (err: Error) => void;
}

interface SendToQueueMessage {
    type: 'sendToQueue';
    queue: string;
    content: Buffer | string | unknown;
    options: amqplib.Options.Publish | undefined;
    resolve: (result: boolean) => void;
    reject: (err: Error) => void;
}

type Message = PublishMessage | SendToQueueMessage;

const IRRECOVERABLE_ERRORS = [
    403, // AMQP Access Refused Error.
    404, // AMQP Not Found Error.
    406, // AMQP Precondition Failed Error.
    501, // AMQP Frame Error.
    502, // AMQP Frame Syntax Error.
    503, // AMQP Invalid Command Error.
    504, // AMQP Channel Not Open Error.
    505, // AMQP Unexpected Frame.
    530, // AMQP Not Allowed Error.
    540, // AMQP Not Implemented Error.
    541, // AMQP Internal Error.
];

/**
 * Calls to `publish()` or `sendToQueue()` work just like in amqplib, but messages are queued internally and
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
    private _connectionManager: IAmqpConnectionManager;
    private _json: boolean;

    /** If we're in the process of creating a channel, this is a Promise which
     * will resolve when the channel is set up.  Otherwise, this is `null`.
     */
    private _settingUp: Promise<void> | undefined = undefined;
    private _setups: SetupFunc[];
    /** Queued messages, not yet sent. */
    private _messages: Message[] = [];
    /** Oublished, but not yet confirmed messages. */
    private _unconfirmedMessages: Message[] = [];
    /** Reason code during publish or sendtoqueue messages. */
    private _irrecoverableCode: number | undefined;

    /**
     * The currently connected channel.  Note that not all setup functions
     * have been run on this channel until `@_settingUp` is either null or
     * resolved.
     */
    private _channel?: amqplib.ConfirmChannel;

    /**
     * True if the "worker" is busy sending messages.  False if we need to
     * start the worker to get stuff done.
     */
    private _working = false;

    /**
     *  We kill off workers when we disconnect.  Whenever we start a new
     * worker, we bump up the `_workerNumber` - this makes it so if stale
     * workers ever do wake up, they'll know to stop working.
     */
    private _workerNumber = 0;

    public name?: string;

    addListener(event: string, listener: (...args: any[]) => void): this;
    addListener(event: 'connect', listener: () => void): this;
    addListener(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
    addListener(event: 'close', listener: () => void): this;
    addListener(event: string, listener: (...args: any[]) => void): this {
        return super.addListener(event, listener);
    }

    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'connect', listener: () => void): this;
    on(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    once(event: string, listener: (...args: any[]) => void): this;
    once(event: 'connect', listener: () => void): this;
    once(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: string, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }

    prependListener(event: string, listener: (...args: any[]) => void): this;
    prependListener(event: 'connect', listener: () => void): this;
    prependListener(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
    prependListener(event: 'close', listener: () => void): this;
    prependListener(event: string, listener: (...args: any[]) => void): this {
        return super.prependListener(event, listener);
    }

    prependOnceListener(event: string, listener: (...args: any[]) => void): this;
    prependOnceListener(event: 'connect', listener: () => void): this;
    prependOnceListener(
        event: 'error',
        listener: (err: Error, info: { name: string }) => void
    ): this;
    prependOnceListener(event: 'close', listener: () => void): this;
    prependOnceListener(event: string, listener: (...args: any[]) => void): this {
        return super.prependOnceListener(event, listener);
    }

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
     * @param setup - setup function.
     * @param [done] - callback.
     * @returns - Resolves when complete.
     */
    addSetup(setup: SetupFunc, done?: pb.Callback<void>): Promise<void> {
        return pb.addCallback(
            done,
            (this._settingUp || Promise.resolve()).then(() => {
                this._setups.push(setup);
                if (this._channel) {
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
     *   down the channel.
     * @param {function} [done] - Optional callback.
     * @returns {void | Promise} - Resolves when complete.
     */
    removeSetup(
        setup: SetupFunc,
        teardown?: pb.Callback<void>,
        done?: pb.Callback<void>
    ): Promise<void> {
        return pb.addCallback(done, () => {
            this._setups = this._setups.filter((s) => s !== setup);

            return (this._settingUp || Promise.resolve()).then(() =>
                this._channel && teardown ? pb.call(teardown, this, this._channel) : undefined
            );
        });
    }

    /**
     * Returns a Promise which resolves when this channel next connects.
     * (Mainly here for unit testing...)
     *
     * @param [done] - Optional callback.
     * @returns - Resolves when connected.
     */
    waitForConnect(done?: pb.Callback<void>): Promise<void> {
        return pb.addCallback(
            done,
            this._channel && !this._settingUp
                ? Promise.resolve()
                : new Promise((resolve) => this.once('connect', resolve))
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
    publish(
        exchange: string,
        routingKey: string,
        content: Buffer | string | unknown,
        options?: amqplib.Options.Publish,
        done?: pb.Callback<boolean>
    ): Promise<boolean> {
        return pb.addCallback(
            done,
            new Promise<boolean>((resolve, reject) => {
                this._messages.push({
                    type: 'publish',
                    exchange,
                    routingKey,
                    content,
                    options,
                    resolve,
                    reject,
                });
                this._startWorker();
            })
        );
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
    sendToQueue(
        queue: string,
        content: Buffer | string | unknown,
        options?: Options.Publish,
        done?: pb.Callback<boolean>
    ): Promise<boolean> {
        return pb.addCallback(
            done,
            new Promise<boolean>((resolve, reject) => {
                this._messages.push({
                    type: 'sendToQueue',
                    queue,
                    content,
                    options,
                    resolve,
                    reject,
                });
                return this._startWorker();
            })
        );
    }

    /**
     * Create a new ChannelWrapper.
     *
     * @param connectionManager - connection manager which
     *   created this channel.
     * @param [options] -
     * @param [options.name] - A name for this channel.  Handy for debugging.
     * @param [options.setup] - A default setup function to call.  See
     *   `addSetup` for details.
     * @param [options.json] - if true, then ChannelWrapper assumes all
     *   messages passed to `publish()` and `sendToQueue()` are plain JSON objects.
     *   These will be encoded automatically before being sent.
     *
     */
    constructor(connectionManager: IAmqpConnectionManager, options: CreateChannelOpts = {}) {
        super();
        this._onConnect = this._onConnect.bind(this);
        this._onDisconnect = this._onDisconnect.bind(this);
        this._connectionManager = connectionManager;
        this.name = options.name;

        this._json = options.json ?? false;

        // Array of setup functions to call.
        this._setups = [];
        if (options.setup) {
            this._setups.push(options.setup);
        }

        const connection = connectionManager.connection;
        if (connection) {
            this._onConnect({ connection });
        }
        connectionManager.on('connect', this._onConnect);
        connectionManager.on('disconnect', this._onDisconnect);
    }

    // Called whenever we connect to the broker.
    private async _onConnect({ connection }: { connection: amqplib.Connection }): Promise<void> {
        this._irrecoverableCode = undefined;

        try {
            const channel = await connection.createConfirmChannel();

            this._channel = channel;
            channel.on('close', () => this._onChannelClose(channel));

            this._settingUp = Promise.all(
                this._setups.map((setupFn) =>
                    // TODO: Use a timeout here to guard against setupFns that never resolve?
                    pb.call(setupFn, this, channel).catch((err) => {
                        if (err.name === 'IllegalOperationError') {
                            // Don't emit an error if setups failed because the channel closed.
                            return;
                        }
                        this.emit('error', err, { name: this.name });
                    })
                )
            ).then(() => {
                this._settingUp = undefined;
            });

            await this._settingUp;

            if (!this._channel) {
                // Can happen if channel closes while we're setting up.
                return;
            }

            if (this._unconfirmedMessages.length > 0) {
                // requeue any messages that were left unconfirmed when connection was lost
                let message: Message | undefined;
                while ((message = this._unconfirmedMessages.shift())) {
                    this._messages.push(message);
                }
            }

            // Since we just connected, publish any queued messages
            this._startWorker();
            this.emit('connect');
        } catch (err) {
            this.emit('error', err, { name: this.name });
            this._settingUp = undefined;
            this._channel = undefined;
        }
    }

    // Called whenever the channel closes.
    private _onChannelClose(channel: amqplib.ConfirmChannel): void {
        if (this._channel === channel) {
            this._channel = undefined;
        }
        // Wait for another reconnect to create a new channel.
    }

    // Called whenever we disconnect from the AMQP server.
    private _onDisconnect(ex: { err: Error & { code: number } }): void {
        this._irrecoverableCode = ex.err instanceof Error ? ex.err.code : undefined;
        this._channel = undefined;
        this._settingUp = undefined;

        // Kill off the current worker.  We never get any kind of error for messages in flight - see
        // https://github.com/squaremo/amqp.node/issues/191.
        this._working = false;
    }

    // Returns the number of unsent messages queued on this channel.
    queueLength(): number {
        return this._messages.length;
    }

    // Destroy this channel.
    //
    // Any unsent messages will have their associated Promises rejected.
    //
    close(): Promise<void> {
        return Promise.resolve().then(() => {
            this._working = false;
            if (this._messages.length !== 0) {
                // Reject any unsent messages.
                this._messages.forEach((message) => message.reject(new Error('Channel closed')));
            }
            if (this._unconfirmedMessages.length !== 0) {
                // Reject any unconfirmed messages.
                this._unconfirmedMessages.forEach((message) =>
                    message.reject(new Error('Channel closed'))
                );
            }

            this._connectionManager.removeListener('connect', this._onConnect);
            this._connectionManager.removeListener('disconnect', this._onDisconnect);
            const answer = (this._channel && this._channel.close()) || undefined;
            this._channel = undefined;

            this.emit('close');

            return answer;
        });
    }

    private _shouldPublish(): boolean {
        return this._messages.length > 0 && !this._settingUp && !!this._channel;
    }

    // Start publishing queued messages, if there isn't already a worker doing this.
    private _startWorker(): void {
        if (!this._working && this._shouldPublish()) {
            this._working = true;
            this._workerNumber++;
            this._publishQueuedMessages(this._workerNumber);
        }
    }

    // Define if a message can cause irrecoverable error
    private _canWaitReconnection(): boolean {
        return !this._irrecoverableCode || !IRRECOVERABLE_ERRORS.includes(this._irrecoverableCode);
    }

    private _publishQueuedMessages(workerNumber: number): void {
        const channel = this._channel;
        if (
            !channel ||
            !this._shouldPublish() ||
            !this._working ||
            workerNumber !== this._workerNumber
        ) {
            // Can't publish anything right now...
            this._working = false;
            return;
        }

        const message = this._messages.shift();
        if (message) {
            this._unconfirmedMessages.push(message);

            Promise.resolve()
                .then(() => {
                    let encodedMessage: Buffer;
                    if (this._json) {
                        encodedMessage = Buffer.from(JSON.stringify(message.content));
                    } else if (typeof message.content === 'string') {
                        encodedMessage = Buffer.from(message.content);
                    } else if (message.content instanceof Buffer) {
                        encodedMessage = message.content;
                    } else if (
                        typeof message.content === 'object' &&
                        typeof (message.content as any).toString === 'function'
                    ) {
                        encodedMessage = Buffer.from((message.content as any).toString());
                    } else {
                        throw new Error('Invalid message content');
                    }

                    let result = true;
                    const sendPromise = (() => {
                        switch (message.type) {
                            case 'publish':
                                return new Promise<boolean>(function (resolve, reject) {
                                    result = channel.publish(
                                        message.exchange,
                                        message.routingKey,
                                        encodedMessage,
                                        message.options,
                                        (err) => {
                                            if (err) {
                                                reject(err);
                                            } else {
                                                resolve(result);
                                            }
                                        }
                                    );
                                });
                            case 'sendToQueue':
                                return new Promise<boolean>(function (resolve, reject) {
                                    result = channel.sendToQueue(
                                        message.queue,
                                        encodedMessage,
                                        message.options,
                                        (err) => {
                                            if (err) {
                                                reject(err);
                                            } else {
                                                resolve(result);
                                            }
                                        }
                                    );
                                });
                            /* istanbul ignore next */
                            default:
                                throw new Error(`Unhandled message type ${(message as any).type}`);
                        }
                    })();

                    if (result) {
                        this._publishQueuedMessages(workerNumber);
                    } else {
                        channel.once('drain', () => this._publishQueuedMessages(workerNumber));
                    }
                    return sendPromise;
                })
                .then(
                    (result) => {
                        removeUnconfirmedMessage(this._unconfirmedMessages, message);
                        message.resolve(result);
                    },

                    (err) => {
                        if (!this._channel && this._canWaitReconnection()) {
                            // Tried to write to a closed channel.  Leave the message in the queue and we'll try again when
                            // we reconnect.
                            removeUnconfirmedMessage(this._unconfirmedMessages, message);
                            this._messages.push(message);
                        } else {
                            // Something went wrong trying to send this message - could be JSON.stringify failed, could be
                            // the broker rejected the message. Either way, reject it back
                            removeUnconfirmedMessage(this._unconfirmedMessages, message);
                            message.reject(err);
                        }
                    }
                )
                .catch(
                    /* istanbul ignore next */ (err) => {
                        this.emit('error', err);
                        this._working = false;
                    }
                );
        }
    }

    /** Send an `ack` to the underlying channel. */
    ack(message: amqplib.Message, allUpTo?: boolean): void {
        this._channel && this._channel.ack(message, allUpTo);
    }

    /** Send an `ackAll` to the underlying channel. */
    ackAll(): void {
        this._channel && this._channel.ackAll();
    }

    /** Send a `nack` to the underlying channel. */
    nack(message: amqplib.Message, allUpTo?: boolean, requeue?: boolean): void {
        this._channel && this._channel.nack(message, allUpTo, requeue);
    }

    /** Send a `nackAll` to the underlying channel. */
    nackAll(requeue?: boolean): void {
        this._channel && this._channel.nackAll(requeue);
    }

    /** Send a `purgeQueue` to the underlying channel. */
    async purgeQueue(queue: string): Promise<amqplib.Replies.PurgeQueue> {
        if (this._channel) {
            return await this._channel.purgeQueue(queue);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    /** Send a `checkQueue` to the underlying channel. */
    async checkQueue(queue: string): Promise<amqplib.Replies.AssertQueue> {
        if (this._channel) {
            return await this._channel.checkQueue(queue);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    /** Send a `assertQueue` to the underlying channel. */
    async assertQueue(
        queue: string,
        options?: amqplib.Options.AssertQueue
    ): Promise<amqplib.Replies.AssertQueue> {
        if (this._channel) {
            return await this._channel.assertQueue(queue, options);
        } else {
            return { queue, messageCount: 0, consumerCount: 0 };
        }
    }

    /** Send a `bindQueue` to the underlying channel. */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async bindQueue(queue: string, source: string, pattern: string, args?: any): Promise<void> {
        if (this._channel) {
            await this._channel.bindQueue(queue, source, pattern, args);
        }
    }

    /** Send a `deleteQueue` to the underlying channel. */
    async deleteQueue(
        queue: string,
        options?: Options.DeleteQueue
    ): Promise<amqplib.Replies.DeleteQueue> {
        if (this._channel) {
            return await this._channel.deleteQueue(queue, options);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    /** Send a `assertExchange` to the underlying channel. */
    async assertExchange(
        exchange: string,
        type: 'direct' | 'topic' | 'headers' | 'fanout' | 'match' | string,
        options?: Options.AssertExchange
    ): Promise<amqplib.Replies.AssertExchange> {
        if (this._channel) {
            return await this._channel.assertExchange(exchange, type, options);
        } else {
            return { exchange };
        }
    }

    /** Send a `get` to the underlying channel. */
    async get(queue: string, options?: Options.Get): Promise<amqplib.GetMessage | false> {
        if (this._channel) {
            return await this._channel.get(queue, options);
        } else {
            throw new Error(`Not connected.`);
        }
    }
}

function removeUnconfirmedMessage(arr: Message[], message: Message) {
    const toRemove = arr.indexOf(message);
    if (toRemove === -1) {
        throw new Error(`Message is not in _unconfirmedMessages!`);
    }
    const removed = arr.splice(toRemove, 1);
    return removed[0];
}

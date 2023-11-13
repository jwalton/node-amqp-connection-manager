import {Message, Connection, GetMessage, Options, Replies } from 'amqplib';
import { EventEmitter } from 'events';
import pb from 'promise-breaker';
import {CHANNEL_IRRECOVERABLE_ERRORS, CHANNEL_MAX_MESSAGES_PER_BATCH, randomBytes} from "./constants";
import {
    Channel,
    Consumer,
    ConsumerOptions,
    CreateChannelOptions,
    IAmqpConnectionManager,
    IChannelWrapper,
    Message as AmqpMessage,
    PublishOptions,
    SetupFunc
} from "./decorate";

export default class ChannelWrapper extends EventEmitter implements IChannelWrapper {
    private _connectionManager: IAmqpConnectionManager;
    private readonly _json: boolean;

    private _settingUp: Promise<void> | undefined = undefined;
    private _setups: SetupFunc[];
    private _messages: AmqpMessage[] = [];
    private _unconfirmedMessages: AmqpMessage[] = [];
    private _irrecoverableCode: number | undefined;
    private _consumers: Consumer[] = [];

    private _channel?: Channel;
    private _confirm = true;
    private _working = false;

    private _workerNumber = 0;
    private _channelHasRoom = true;
    private readonly _publishTimeout?: number;

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

    removeSetup(setup: SetupFunc, teardown?: SetupFunc, done?: pb.Callback<void>): Promise<void> {
        return pb.addCallback(done, () => {
            this._setups = this._setups.filter((s) => s !== setup);

            return (this._settingUp || Promise.resolve()).then(() =>
                this._channel && teardown ? pb.call(teardown, this, this._channel) : undefined
            );
        });
    }

    waitForConnect(done?: pb.Callback<void>): Promise<void> {
        return pb.addCallback(
            done,
            this._channel && !this._settingUp
                ? Promise.resolve()
                : new Promise((resolve) => this.once('connect', resolve))
        );
    }

    publish(
        exchange: string,
        routingKey: string,
        content: Buffer | string | unknown,
        options?: PublishOptions,
        done?: pb.Callback<boolean>
    ): Promise<boolean> {
        return pb.addCallback(
            done,
            new Promise<boolean>((resolve, reject) => {
                const { timeout, ...opts } = options || {};
                this._enqueueMessage(
                    {
                        type: 'publish',
                        exchange,
                        routingKey,
                        content: this._getEncodedMessage(content),
                        resolve,
                        reject,
                        options: opts,
                        isTimedOut: false,
                    },
                    timeout || this._publishTimeout
                );
                this._startWorker();
            })
        );
    }

    sendToQueue(
        queue: string,
        content: Buffer | string | unknown,
        options?: PublishOptions,
        done?: pb.Callback<boolean>
    ): Promise<boolean> {
        const encodedContent = this._getEncodedMessage(content);

        return pb.addCallback(
            done,
            new Promise<boolean>((resolve, reject) => {
                const { timeout, ...opts } = options || {};
                this._enqueueMessage(
                    {
                        type: 'sendToQueue',
                        queue,
                        content: encodedContent,
                        resolve,
                        reject,
                        options: opts,
                        isTimedOut: false,
                    },
                    timeout || this._publishTimeout
                );
                this._startWorker();
            })
        );
    }

    private _enqueueMessage(message: AmqpMessage, timeout?: number) {
        if (timeout) {
            message.timeout = setTimeout(() => {
                let idx = this._messages.indexOf(message);
                if (idx !== -1) {
                    this._messages.splice(idx, 1);
                } else {
                    idx = this._unconfirmedMessages.indexOf(message);
                    if (idx !== -1) {
                        this._unconfirmedMessages.splice(idx, 1);
                    }
                }
                message.isTimedOut = true;
                message.reject(new Error('timeout'));
            }, timeout);
        }
        this._messages.push(message);
    }

    constructor(connectionManager: IAmqpConnectionManager, options: CreateChannelOptions = {}) {
        super();
        this._onConnect = this._onConnect.bind(this);
        this._onDisconnect = this._onDisconnect.bind(this);
        this._connectionManager = connectionManager;
        this._confirm = options.confirm ?? true;
        this.name = options.name;

        this._publishTimeout = options.publishTimeout;
        this._json = options.json ?? false;

        // Array of setup functions to call.
        this._setups = [];
        this._consumers = [];

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

    private async _onConnect({ connection }: { connection: Connection }): Promise<void> {
        this._irrecoverableCode = undefined;

        try {
            let channel: Channel;
            if (this._confirm) {
                channel = await connection.createConfirmChannel();
            } else {
                channel = await connection.createChannel();
            }

            this._channel = channel;
            this._channelHasRoom = true;
            channel.on('close', () => this._onChannelClose(channel));
            channel.on('drain', () => this._onChannelDrain());

            this._settingUp = Promise.all(
                this._setups.map((setupFn) =>
                    // TODO: Use a timeout here to guard against setupFns that never resolve?
                    pb.call(setupFn, this, channel).catch((err) => {
                        if (err.name === 'IllegalOperationError') {
                            return;
                        }
                        this.emit('error', err, { name: this.name });
                    })
                )
            )
                .then(() => {
                    return Promise.all(this._consumers.map((c) => this._reconnectConsumer(c)));
                })
                .then(() => {
                    this._settingUp = undefined;
                });
            await this._settingUp;

            if (!this._channel) {
                return;
            }

            this._startWorker();
            this.emit('connect');
        } catch (err) {
            this.emit('error', err, { name: this.name });
            this._settingUp = undefined;
            this._channel = undefined;
        }
    }

    private _onChannelClose(channel: Channel): void {
        if (this._channel === channel) {
            this._channel = undefined;
        }
    }

    private _onChannelDrain(): void {
        this._channelHasRoom = true;
        this._startWorker();
    }

    private _onDisconnect(ex: { err: Error & { code: number } }): void {
        this._irrecoverableCode = ex.err instanceof Error ? ex.err.code : undefined;
        this._channel = undefined;
        this._settingUp = undefined;

        // Kill off the current worker.  We never get any kind of error for messages in flight - see
        // https://github.com/squaremo/amqp.node/issues/191. - Jason Walton
        this._working = false;
    }


    queueLength(): number {
        return this._messages.length;
    }


    async close(): Promise<void> {
        await Promise.resolve();
        this._working = false;
        if (this._messages.length !== 0) {
            // Reject any unsent messages.
            this._messages.forEach((message) => {
                if (message.timeout) {
                    clearTimeout(message.timeout);
                }
                message.reject(new Error('Channel closed'));
            });
        }
        if (this._unconfirmedMessages.length !== 0) {
            // Reject any unconfirmed messages.
            this._unconfirmedMessages.forEach((message_2) => {
                if (message_2.timeout) {
                    clearTimeout(message_2.timeout);
                }
                message_2.reject(new Error('Channel closed'));
            });
        }
        this._connectionManager.removeListener('connect', this._onConnect);
        this._connectionManager.removeListener('disconnect', this._onDisconnect);
        const answer = (this._channel && this._channel.close()) || undefined;
        this._channel = undefined;
        this.emit('close');
        return answer;
    }

    private _shouldPublish(): boolean {
        return (
            this._messages.length > 0 && !this._settingUp && !!this._channel && this._channelHasRoom
        );
    }

    private _startWorker(): void {
        if (!this._working && this._shouldPublish()) {
            this._working = true;
            this._workerNumber++;
            this._publishQueuedMessages(this._workerNumber);
        }
    }

    // Define if a message can cause irrecoverable error
    private _canWaitReconnection(): boolean {
        return !this._irrecoverableCode || !CHANNEL_IRRECOVERABLE_ERRORS.includes(this._irrecoverableCode);
    }

    private _messageResolved(message: AmqpMessage, result: boolean) {
        removeUnconfirmedMessage(this._unconfirmedMessages, message);
        message.resolve(result);
    }

    private _messageRejected(message: AmqpMessage, err: Error) {
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

    private _getEncodedMessage(content: Buffer | string | unknown): Buffer {
        let encodedMessage: Buffer;

        if (this._json) {
            encodedMessage = Buffer.from(JSON.stringify(content));
        } else if (typeof content === 'string') {
            encodedMessage = Buffer.from(content);
        } else if (content instanceof Buffer) {
            encodedMessage = content;
        } else if (typeof content === 'object' && typeof (content as any).toString === 'function') {
            encodedMessage = Buffer.from((content as any).toString());
        } else {
            console.warn(
                'amqp-connection-manager: Sending JSON message, but json option not speicifed'
            );
            encodedMessage = Buffer.from(JSON.stringify(content));
        }

        return encodedMessage;
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

        try {
            // Send messages in batches of 1000 - don't want to starve the event loop.
            let sendsLeft = CHANNEL_MAX_MESSAGES_PER_BATCH;
            while (this._channelHasRoom && this._messages.length > 0 && sendsLeft > 0) {
                sendsLeft--;

                const message = this._messages.shift();
                if (!message) {
                    break;
                }

                let thisCanSend = true;

                switch (message.type) {
                    case 'publish': {
                        if (this._confirm) {
                            this._unconfirmedMessages.push(message);
                            thisCanSend = this._channelHasRoom = channel.publish(
                                message.exchange,
                                message.routingKey,
                                message.content,
                                message.options,
                                (err) => {
                                    if (message.isTimedOut) {
                                        return;
                                    }

                                    if (message.timeout) {
                                        clearTimeout(message.timeout);
                                    }

                                    if (err) {
                                        this._messageRejected(message, err);
                                    } else {
                                        this._messageResolved(message, thisCanSend);
                                    }
                                }
                            );
                        } else {
                            if (message.timeout) {
                                clearTimeout(message.timeout);
                            }
                            thisCanSend = this._channelHasRoom = channel.publish(
                                message.exchange,
                                message.routingKey,
                                message.content,
                                message.options
                            );
                            message.resolve(thisCanSend);
                        }
                        break;
                    }
                    case 'sendToQueue': {
                        if (this._confirm) {
                            this._unconfirmedMessages.push(message);
                            thisCanSend = this._channelHasRoom = channel.sendToQueue(
                                message.queue,
                                message.content,
                                message.options,
                                (err) => {
                                    if (message.isTimedOut) {
                                        return;
                                    }

                                    if (message.timeout) {
                                        clearTimeout(message.timeout);
                                    }

                                    if (err) {
                                        this._messageRejected(message, err);
                                    } else {
                                        this._messageResolved(message, thisCanSend);
                                    }
                                }
                            );
                        } else {
                            if (message.timeout) {
                                clearTimeout(message.timeout);
                            }
                            thisCanSend = this._channelHasRoom = channel.sendToQueue(
                                message.queue,
                                message.content,
                                message.options
                            );
                            message.resolve(thisCanSend);
                        }
                        break;
                    }
                    /* istanbul ignore next */
                    default:
                        throw new Error(`Unhandled message type ${(message as any).type}`);
                }
            }

            // If we didn't send all the messages, send some more...
            if (this._channelHasRoom && this._messages.length > 0) {
                setImmediate(() => this._publishQueuedMessages(workerNumber));
            } else {
                this._working = false;
            }

            /* istanbul ignore next */
        } catch (err) {
            this._working = false;
            this.emit('error', err);
        }
    }

    async consume(
        queue: string,
        onMessage: Consumer['onMessage'],
        options: ConsumerOptions = {}
    ): Promise<Replies.Consume> {
        const consumerTag = options.consumerTag || (await randomBytes(16)).toString('hex');
        const consumer: Consumer = {
            consumerTag: null,
            queue,
            onMessage,
            options: {
                ...options,
                consumerTag,
            },
        };

        if (this._settingUp) {
            await this._settingUp;
        }

        this._consumers.push(consumer);
        await this._consume(consumer);
        return { consumerTag };
    }

    private async _consume(consumer: Consumer): Promise<void> {
        if (!this._channel) {
            return;
        }

        const { prefetch, ...options } = consumer.options;
        if (typeof prefetch === 'number') {
            await this._channel.prefetch(prefetch, false);
        }

        const { consumerTag } = await this._channel.consume(
            consumer.queue,
            (msg) => {
                if (!msg) {
                    consumer.consumerTag = null;
                    this._reconnectConsumer(consumer).catch((err) => {
                        if (err.code === 404) {
                            // Ignore errors caused by queue not declared. In
                            // those cases the connection will reconnect and
                            // then consumers reestablished. The full reconnect
                            // might be avoided if we assert the queue again
                            // before starting to consume.
                            return;
                        }
                        this.emit('error', err);
                    });
                    return;
                }
                consumer.onMessage(msg);
            },
            options
        );
        consumer.consumerTag = consumerTag;
    }

    private async _reconnectConsumer(consumer: Consumer): Promise<void> {
        if (!this._consumers.includes(consumer)) {
            // Intentionally canceled
            return;
        }
        await this._consume(consumer);
    }

    async cancelAll(): Promise<void> {
        const consumers = this._consumers;
        this._consumers = [];
        if (!this._channel) {
            return;
        }

        const channel = this._channel;
        await Promise.all(
            consumers.reduce<any[]>((acc, consumer) => {
                if (consumer.consumerTag) {
                    acc.push(channel.cancel(consumer.consumerTag));
                }
                return acc;
            }, [])
        );
    }

    async cancel(consumerTag: string): Promise<void> {
        const idx = this._consumers.findIndex((x) => x.options.consumerTag === consumerTag);
        if (idx === -1) {
            return;
        }

        const consumer = this._consumers[idx];
        this._consumers.splice(idx, 1);
        if (this._channel && consumer.consumerTag) {
            await this._channel.cancel(consumer.consumerTag);
        }
    }

    ack(message: Message, allUpTo?: boolean): void {
        this._channel && this._channel.ack(message, allUpTo);
    }

    ackAll(): void {
        this._channel && this._channel.ackAll();
    }

    nack(message: Message, allUpTo?: boolean, requeue?: boolean): void {
        this._channel && this._channel.nack(message, allUpTo, requeue);
    }

    nackAll(requeue?: boolean): void {
        this._channel && this._channel.nackAll(requeue);
    }

    async purgeQueue(queue: string): Promise<Replies.PurgeQueue> {
        if (this._channel) {
            return await this._channel.purgeQueue(queue);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    async checkQueue(queue: string): Promise<Replies.AssertQueue> {
        if (this._channel) {
            return await this._channel.checkQueue(queue);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    async assertQueue(
        queue: string,
        options?: Options.AssertQueue
    ): Promise<Replies.AssertQueue> {
        if (this._channel) {
            return await this._channel.assertQueue(queue, options);
        } else {
            return { queue, messageCount: 0, consumerCount: 0 };
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async bindQueue(queue: string, source: string, pattern: string, args?: any): Promise<void> {
        if (this._channel) {
            await this._channel.bindQueue(queue, source, pattern, args);
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async unbindQueue(queue: string, source: string, pattern: string, args?: any): Promise<void> {
        if (this._channel) {
            await this._channel.unbindQueue(queue, source, pattern, args);
        }
    }

    async deleteQueue(
        queue: string,
        options?: Options.DeleteQueue
    ): Promise<Replies.DeleteQueue> {
        if (this._channel) {
            return await this._channel.deleteQueue(queue, options);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    async assertExchange(
        exchange: string,
        type: 'direct' | 'topic' | 'headers' | 'fanout' | 'match' | string,
        options?: Options.AssertExchange
    ): Promise<Replies.AssertExchange> {
        if (this._channel) {
            return await this._channel.assertExchange(exchange, type, options);
        } else {
            return { exchange };
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async bindExchange(
        destination: string,
        source: string,
        pattern: string,
        args?: any
    ): Promise<Replies.Empty> {
        if (this._channel) {
            return await this._channel.bindExchange(destination, source, pattern, args);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    async checkExchange(exchange: string): Promise<Replies.Empty> {
        if (this._channel) {
            return await this._channel.checkExchange(exchange);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    async deleteExchange(
        exchange: string,
        options?: Options.DeleteExchange
    ): Promise<Replies.Empty> {
        if (this._channel) {
            return await this._channel.deleteExchange(exchange, options);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async unbindExchange(
        destination: string,
        source: string,
        pattern: string,
        args?: any
    ): Promise<Replies.Empty> {
        if (this._channel) {
            return await this._channel.unbindExchange(destination, source, pattern, args);
        } else {
            throw new Error(`Not connected.`);
        }
    }

    async get(queue: string, options?: Options.Get): Promise<GetMessage | false> {
        if (this._channel) {
            return await this._channel.get(queue, options);
        } else {
            throw new Error(`Not connected.`);
        }
    }
}

function removeUnconfirmedMessage(arr: AmqpMessage[], message: AmqpMessage) {
    const toRemove = arr.indexOf(message);
    if (toRemove === -1) {
        throw new Error(`Message is not in _unconfirmedMessages!`);
    }
    const removed = arr.splice(toRemove, 1);
    return removed[0];
}

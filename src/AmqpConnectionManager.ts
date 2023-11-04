import * as amqp from 'amqplib';
import { EventEmitter, once } from 'events';
import { TcpSocketConnectOpts } from 'net';
import pb from 'promise-breaker';
import { ConnectionOptions } from 'tls';
import { URL } from 'url';
import ChannelWrapper, { CreateChannelOpts } from './ChannelWrapper.js';
import { wait } from './helpers.js';

// Default heartbeat time.
const HEARTBEAT_IN_SECONDS = 5;

export type ConnectionUrl =
    | string
    | amqp.Options.Connect
    | { url: string; connectionOptions?: AmqpConnectionOptions };

export interface ConnectListener {
    (arg: { connection: amqp.Connection; url: string | amqp.Options.Connect }): void;
}

export interface ConnectFailedListener {
    (arg: { err: Error; url: string | amqp.Options.Connect | undefined }): void;
}

export type AmqpConnectionOptions = (ConnectionOptions | TcpSocketConnectOpts) & {
    noDelay?: boolean;
    timeout?: number;
    keepAlive?: boolean;
    keepAliveDelay?: number;
    clientProperties?: any;
    credentials?:
        | {
              mechanism: string;
              username: string;
              password: string;
              response: () => Buffer;
          }
        | {
              mechanism: string;
              response: () => Buffer;
          }
        | undefined;
};

export interface AmqpConnectionManagerOptions {
    /** Interval to send heartbeats to broker. Defaults to 5 seconds. */
    heartbeatIntervalInSeconds?: number;

    /**
     * The time to wait before trying to reconnect. If not specified, defaults
     * to `heartbeatIntervalInSeconds`.
     */
    reconnectTimeInSeconds?: number | undefined;

    /**
     * `findServers` is a function that which returns one or more servers to
     * connect to. This should return either a single URL or an array of URLs.
     * This is handy when you're using a service discovery mechanism such as
     * Consul or etcd. Instead of taking a callback, this can also return a
     * Promise. Note that if this is supplied, then `urls` is ignored.
     */
    findServers?:
        | ((callback: (urls: ConnectionUrl | ConnectionUrl[]) => void) => void)
        | (() => Promise<ConnectionUrl | ConnectionUrl[]>)
        | undefined;

    /** Connection options, passed as options to the amqplib.connect() method. */
    connectionOptions?: AmqpConnectionOptions;
}

/* istanbul ignore next */
function neverThrows() {
    return (err: Error) =>
        setImmediate(() => {
            throw new Error(
                `AmqpConnectionManager - should never get here: ${err.message}\n` + err.stack
            );
        });
}

export interface IAmqpConnectionManager {
    connectionOptions?: AmqpConnectionOptions;
    heartbeatIntervalInSeconds: number;
    reconnectTimeInSeconds: number;

    addListener(event: string, listener: (...args: any[]) => void): this;
    addListener(event: 'connect', listener: ConnectListener): this;
    addListener(event: 'connectFailed', listener: ConnectFailedListener): this;
    addListener(event: 'blocked', listener: (arg: { reason: string }) => void): this;
    addListener(event: 'unblocked', listener: () => void): this;
    addListener(event: 'disconnect', listener: (arg: { err: Error }) => void): this;

    // eslint-disable-next-line @typescript-eslint/ban-types
    listeners(eventName: string | symbol): Function[];

    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'connect', listener: ConnectListener): this;
    on(event: 'connectFailed', listener: ConnectFailedListener): this;
    on(event: 'blocked', listener: (arg: { reason: string }) => void): this;
    on(event: 'unblocked', listener: () => void): this;
    on(event: 'disconnect', listener: (arg: { err: Error }) => void): this;

    once(event: string, listener: (...args: any[]) => void): this;
    once(event: 'connect', listener: ConnectListener): this;
    once(event: 'connectFailed', listener: ConnectFailedListener): this;
    once(event: 'blocked', listener: (arg: { reason: string }) => void): this;
    once(event: 'unblocked', listener: () => void): this;
    once(event: 'disconnect', listener: (arg: { err: Error }) => void): this;

    prependListener(event: string, listener: (...args: any[]) => void): this;
    prependListener(event: 'connect', listener: ConnectListener): this;
    prependListener(event: 'connectFailed', listener: ConnectFailedListener): this;
    prependListener(event: 'blocked', listener: (arg: { reason: string }) => void): this;
    prependListener(event: 'unblocked', listener: () => void): this;
    prependListener(event: 'disconnect', listener: (arg: { err: Error }) => void): this;

    prependOnceListener(event: string, listener: (...args: any[]) => void): this;
    prependOnceListener(event: 'connect', listener: ConnectListener): this;
    prependOnceListener(event: 'connectFailed', listener: ConnectFailedListener): this;
    prependOnceListener(event: 'blocked', listener: (arg: { reason: string }) => void): this;
    prependOnceListener(event: 'unblocked', listener: () => void): this;
    prependOnceListener(event: 'disconnect', listener: (arg: { err: Error }) => void): this;

    removeListener(event: string, listener: (...args: any[]) => void): this;

    connect(options?: { timeout?: number }): Promise<void>;
    reconnect(): void;
    createChannel(options?: CreateChannelOpts): ChannelWrapper;
    findChannel(name: string): ChannelWrapper | undefined;
    close(): Promise<void>;
    isConnected(): boolean;

    /** The current connection. */
    readonly connection: amqp.Connection | undefined;

    /** Returns the number of registered channels. */
    readonly channelCount: number;
}

//
// Events:
// * `connect({connection, url})` - Emitted whenever we connect to a broker.
// * `connectFailed({err, url})` - Emitted whenever we fail to connect to a broker.
// * `disconnect({err})` - Emitted whenever we disconnect from a broker.
// * `blocked({reason})` - Emitted whenever connection is blocked by a broker.
// * `unblocked()` - Emitted whenever connection is unblocked by a broker.
//
export default class AmqpConnectionManager extends EventEmitter implements IAmqpConnectionManager {
    private _channels: ChannelWrapper[];
    private _currentUrl: number;
    private _closed = false;
    private _cancelRetriesHandler?: () => void;
    private _connectPromise?: Promise<null>;
    private _currentConnection?: amqp.Connection;
    private _findServers:
        | ((callback: (urls: ConnectionUrl | ConnectionUrl[]) => void) => void)
        | (() => Promise<ConnectionUrl | ConnectionUrl[]>);
    private _urls?: ConnectionUrl[];

    public connectionOptions: AmqpConnectionOptions | undefined;
    public heartbeatIntervalInSeconds: number;
    public reconnectTimeInSeconds: number;

    /**
     *  Create a new AmqplibConnectionManager.
     *
     * @param urls - An array of brokers to connect to.
     *   Takes url strings or objects {url: string, connectionOptions?: object}
     *   If present, a broker's [connectionOptions] will be used instead
     *   of [options.connectionOptions] when passed to the amqplib connect method.
     *   AmqplibConnectionManager will round-robin between them whenever it
     *   needs to create a new connection.
     * @param [options={}] -
     * @param [options.heartbeatIntervalInSeconds=5] - The interval,
     *   in seconds, to send heartbeats.
     * @param [options.reconnectTimeInSeconds] - The time to wait
     *   before trying to reconnect.  If not specified, defaults to
     *   `heartbeatIntervalInSeconds`.
     * @param [options.connectionOptions] - Passed to the amqplib
     *   connect method.
     * @param [options.findServers] - A `fn(callback)` or a `fn()`
     *   which returns a Promise.  This should resolve to one or more servers
     *   to connect to, either a single URL or an array of URLs.  This is handy
     *   when you're using a service discovery mechanism such as Consul or etcd.
     *   Note that if this is supplied, then `urls` is ignored.
     */
    constructor(
        urls: ConnectionUrl | ConnectionUrl[] | undefined | null,
        options: AmqpConnectionManagerOptions = {}
    ) {
        super();
        if (!urls && !options.findServers) {
            throw new Error('Must supply either `urls` or `findServers`');
        }
        this._channels = [];

        this._currentUrl = 0;
        this.connectionOptions = options.connectionOptions;

        this.heartbeatIntervalInSeconds =
            options.heartbeatIntervalInSeconds || options.heartbeatIntervalInSeconds === 0
                ? options.heartbeatIntervalInSeconds
                : HEARTBEAT_IN_SECONDS;
        this.reconnectTimeInSeconds =
            options.reconnectTimeInSeconds || this.heartbeatIntervalInSeconds;

        // There will be one listener per channel, and there could be a lot of channels, so disable warnings from node.
        this.setMaxListeners(0);

        this._findServers = options.findServers || (() => Promise.resolve(urls));
    }

    /**
     * Start the connect retries and await the first connect result. Even if the initial connect fails or timeouts, the
     * reconnect attempts will continue in the background.
     * @param [options={}] -
     * @param [options.timeout] - Time to wait for initial connect
     */
    async connect({ timeout }: { timeout?: number } = {}): Promise<void> {
        this._connect();

        let reject: (reason?: any) => void;
        const onConnectFailed = ({ err }: { err: Error }) => {
            // Ignore disconnects caused bad credentials.
            if (err.message.includes('ACCESS-REFUSED') || err.message.includes('403')) {
                reject(err);
            }
        };

        let waitTimeout;
        if (timeout) {
            waitTimeout = wait(timeout);
        }
        try {
            await Promise.race([
                once(this, 'connect'),
                new Promise((_resolve, innerReject) => {
                    reject = innerReject;
                    this.on('connectFailed', onConnectFailed);
                }),
                ...(waitTimeout
                    ? [
                          waitTimeout.promise.then(() => {
                              throw new Error('amqp-connection-manager: connect timeout');
                          }),
                      ]
                    : []),
            ]);
        } finally {
            waitTimeout?.cancel();
            this.removeListener('connectFailed', onConnectFailed);
        }
    }

    // `options` here are any options that can be passed to ChannelWrapper.
    createChannel(options: CreateChannelOpts = {}): ChannelWrapper {
        const channel = new ChannelWrapper(this, options);
        this._channels.push(channel);
        channel.once('close', () => {
            this._channels = this._channels.filter((c) => c !== channel);
        });
        return channel;
    }

    findChannel(name: string): ChannelWrapper | undefined {
        return this._channels.find((obj) => obj.name === name) || undefined;
    }

    close(): Promise<void> {
        if (this._closed) {
            return Promise.resolve();
        }
        this._closed = true;

        if (this._cancelRetriesHandler) {
            this._cancelRetriesHandler();
            this._cancelRetriesHandler = undefined;
        }

        return Promise.resolve(this._connectPromise).then(() => {
            return Promise.all(this._channels.map((channel) => channel.close()))
                .catch(function () {
                    // Ignore errors closing channels.
                })
                .then(() => {
                    this._channels = [];
                    if (this._currentConnection) {
                        this._currentConnection.removeAllListeners('close');
                        return this._currentConnection.close();
                    } else {
                        return null;
                    }
                })
                .then(() => {
                    this._currentConnection = undefined;
                });
        });
    }

    isConnected(): boolean {
        return !!this._currentConnection;
    }

    /** Force reconnect - noop unless connected */
    reconnect(): void {
        if (this._closed) {
            throw new Error('cannot reconnect after close');
        }

        // If we have a connection, close it and immediately connect again.
        // Wait for ordinary reconnect otherwise.
        if (this._currentConnection) {
            this._currentConnection.removeAllListeners();
            this._currentConnection
                .close()
                .catch(() => {
                    // noop
                })
                .then(() => {
                    this._currentConnection = undefined;
                    this.emit('disconnect', { err: new Error('forced reconnect') });
                    return this._connect();
                })
                .catch(neverThrows);
        }
    }

    /** The current connection. */
    get connection(): amqp.Connection | undefined {
        return this._currentConnection;
    }

    /** Returns the number of registered channels. */
    get channelCount(): number {
        return this._channels.length;
    }

    private _connect(): Promise<null> {
        if (this._connectPromise) {
            return this._connectPromise;
        }

        if (this._closed || this.isConnected()) {
            return Promise.resolve(null);
        }

        let attemptedUrl: string | amqp.Options.Connect | undefined;

        const result = (this._connectPromise = Promise.resolve()
            .then(() => {
                if (!this._urls || this._currentUrl >= this._urls.length) {
                    this._currentUrl = 0;
                    return pb.call(this._findServers, 0, null);
                } else {
                    return this._urls;
                }
            })
            .then((urls: ConnectionUrl | ConnectionUrl[] | undefined) => {
                if (Array.isArray(urls)) {
                    this._urls = urls;
                } else if (urls) {
                    this._urls = [urls];
                }

                if (!this._urls || this._urls.length === 0) {
                    throw new Error('amqp-connection-manager: No servers found');
                }

                // Round robin between brokers
                const url = this._urls[this._currentUrl];
                this._currentUrl++;

                // Set connectionOptions to the setting in the class instance (which came via the constructor)
                let connectionOptions: ConnectionOptions | undefined = this.connectionOptions;
                let originalUrl: string | amqp.Options.Connect;
                let connect: string | amqp.Options.Connect;

                if (typeof url === 'object' && 'url' in url) {
                    originalUrl = connect = url.url;
                    // If URL is an object, pull out any specific URL connectionOptions for it or use the
                    // instance connectionOptions if none were provided for this specific URL.
                    connectionOptions = url.connectionOptions || this.connectionOptions;
                } else if (typeof url === 'string') {
                    originalUrl = connect = url;
                } else {
                    originalUrl = url;
                    connect = {
                        ...url,
                        heartbeat: url.heartbeat ?? this.heartbeatIntervalInSeconds,
                    };
                }
                attemptedUrl = originalUrl;

                // Add the `heartbeastIntervalInSeconds` to the connection options.
                if (typeof connect === 'string') {
                    const u = new URL(connect);
                    if (!u.searchParams.get('heartbeat')) {
                        u.searchParams.set('heartbeat', `${this.heartbeatIntervalInSeconds}`);
                    }
                    connect = u.toString();
                }

                return amqp.connect(connect, connectionOptions).then((connection) => {
                    this._currentConnection = connection;

                    //emit 'blocked' when RabbitMQ server decides to block the connection (resources running low)
                    connection.on('blocked', (reason) => this.emit('blocked', { reason }));

                    connection.on('unblocked', () => this.emit('unblocked'));

                    connection.on('error', (/* err */) => {
                        // if this event was emitted, then the connection was already closed,
                        // so no need to call #close here
                        // also, 'close' is emitted after 'error',
                        // so no need for work already done in 'close' handler
                    });

                    // Reconnect if the connection closes
                    connection.on('close', (err) => {
                        this._currentConnection = undefined;
                        this.emit('disconnect', { err });

                        const handle = wait(this.reconnectTimeInSeconds * 1000);
                        this._cancelRetriesHandler = handle.cancel;

                        handle.promise
                            .then(() => this._connect())
                            // `_connect()` should never throw.
                            .catch(neverThrows);
                    });

                    this._connectPromise = undefined;
                    this.emit('connect', { connection, url: originalUrl });

                    // Need to return null here, or Bluebird will complain - #171.
                    return null;
                });
            })
            .catch((err) => {
                this.emit('connectFailed', { err, url: attemptedUrl });

                // Connection failed...
                this._currentConnection = undefined;
                this._connectPromise = undefined;

                let handle;
                if (err.name === 'OperationalError' && err.message === 'connect ETIMEDOUT') {
                    handle = wait(0);
                } else {
                    handle = wait(this.reconnectTimeInSeconds * 1000);
                }
                this._cancelRetriesHandler = handle.cancel;

                return handle.promise.then(() => this._connect());
            }));

        return result;
    }
}

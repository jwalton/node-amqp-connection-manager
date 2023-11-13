import * as amqp from 'amqplib';
import {EventEmitter, once} from 'events';
import pb from 'promise-breaker';
import {ConnectionOptions} from 'tls';
import {URL} from 'url';
import ChannelWrapper from "./ChannelWrapper";
import {AMQP_MANAGER_HEARTBEAT_IN_SECONDS} from "./constants";
import {
    AmqpConnectionManagerOptions,
    AmqpConnectionOptions,
    CreateChannelOptions,
    IAmqpConnectionManager
} from "./decorate";
import {wait} from "./helpers";

/* istanbul ignore next */
function neverThrows() {
    return (err: Error) =>
        setImmediate(() => {
            throw new Error(
                `AmqpConnectionManager - should never get here: ${err.message}\n` + err.stack
            );
        });
}

/**
 * Amqp Connection Manager
 * @since 1.0.0
 * @description The main class that controls all logic and spins off channels.
 * @class
 * @extends EventEmitter
 * @implements IAmqpConnectionManager
 */
export default class AmqpConnectionManager extends EventEmitter implements IAmqpConnectionManager {

    public connectionOptions: AmqpConnectionOptions | undefined;
    public heartbeatIntervalInSeconds: number;
    public reconnectTimeInSeconds: number;

    private _attemptedUrl: string | amqp.Options.Connect | undefined

    private _cancelRetriesHandler?: () => void;
    private _channels: ChannelWrapper[];
    private _closed = false;
    private _connectPromise?: Promise<void>;
    private _currentConnection?: amqp.Connection;
    private _currentUrl: number;

    private readonly _findServers:
      | ((callback: (urls: any) => void) => void)
      | (() => Promise<any>);

    private _urls?: any

    constructor(
      urls: any,
      options: AmqpConnectionManagerOptions = {}
    ) {
        super();

        this.connectionOptions = options.connectionOptions;

        if (!urls && !options.connectionOptions?.findServers) {
            throw new Error('amqp-connection-manager: Must supply either `urls` or `findServers`');
        }

        this._attemptedUrl = undefined;
        this._channels = [];
        this._currentUrl = 0;

        if (Array.isArray(urls)) {
            this._urls = urls;
        } else if (urls) {
            this._urls = [urls];
        }

        this.heartbeatIntervalInSeconds = options.connectionOptions?.heartbeatIntervalInSeconds || options.connectionOptions?.heartbeatIntervalInSeconds === 0 ? options.connectionOptions?.heartbeatIntervalInSeconds : AMQP_MANAGER_HEARTBEAT_IN_SECONDS;
        this.reconnectTimeInSeconds = options.connectionOptions?.reconnectTimeInSeconds || this.heartbeatIntervalInSeconds;

        // There will be one listener per channel,
        // and there could be a lot of channels, so disable warnings from Node.js
        this.setMaxListeners(0);

        this._findServers = options.connectionOptions?.findServers || (() => Promise.resolve(urls));
    }

    get channelCount(): number {
        return this._channels.length;
    }

    async close(): Promise<void> {
        if (this._closed) {
            return Promise.resolve();
        }
        this._closed = true;

        if (this._cancelRetriesHandler) {
            this._cancelRetriesHandler();
            this._cancelRetriesHandler = undefined;
        }

        return Promise.resolve(this._connectPromise).then(async () => {
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

    async connect({timeout}: { timeout?: number } = {}): Promise<void> {
        void this._connect();

        let reject: (reason?: any) => void;
        const onConnectFailed = ({err}: { err: Error }) => {
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

    get connection(): amqp.Connection | undefined {
        return this._currentConnection;
    }

    createChannel(options: CreateChannelOptions = {}): ChannelWrapper {
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

    isConnected(): boolean {
        return !!this._currentConnection;
    }

    reconnect(): void {
        if (this._closed) {
            throw new Error('cannot reconnect after close');
        }

        // If we have a connection, close it and immediately connect again.
        // Wait for ordinary reconnecting otherwise.
        if (this._currentConnection) {
            this._currentConnection.removeAllListeners();
            this._currentConnection
              .close()
              .catch(() => {
                  // noop
              })
              .then(() => {
                  this._currentConnection = undefined;
                  this.emit('disconnect', {err: new Error('forced reconnect')});
                  return this._connect();
              })
              .catch(neverThrows);
        }
    }

    /***********************/
    /** PRIVATE FUNCTIONS **/
    /***********************/

    private async _connect (): Promise<null | void> {

        this._connectPromise = Promise.resolve()

        if (!this._urls) {
            this._currentUrl = 0;
            const urlProcess = await pb.call(this._findServers, 0, null);
            this._urls = Array.isArray(urlProcess) ? [...urlProcess] : (urlProcess ? [urlProcess]: undefined)
        }

        try {

            if (!this._urls || this._urls.length == 0) {
                throw new Error('amqp-connection-manager: No servers found');
            }

            let connectionOptions: ConnectionOptions | undefined = this.connectionOptions;
            let originalUrl: string | amqp.Options.Connect;
            let connect: string | amqp.Options.Connect;

            const url = this._urls[this._currentUrl];
            this._currentUrl++;

            if (typeof url === 'object' && 'url' in url) {
                originalUrl = connect = url.url;
                // If the URL is an object, pull out any specific URL connectionOptions for it or use the
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

            this._attemptedUrl = originalUrl;

            if (typeof connect === 'string') {
                 const u = new URL(connect);
                 if (!u.searchParams.get('heartbeat')) {
                     u.searchParams.set('heartbeat', `${this.heartbeatIntervalInSeconds}`);
                 }
                 connect = u.toString();
             }

            void await amqp.connect(connect, connectionOptions).then((connection) => {
                 this._currentConnection = connection;

                 //emit 'blocked' when RabbitMQ server decides to block the connection (resources running low)
                 connection.on('blocked', (reason) => this.emit('blocked', {reason}));

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

                     this.emit('disconnect', {err});

                     const handle = wait(this.reconnectTimeInSeconds * 1000);
                     this._cancelRetriesHandler = handle.cancel;

                     handle.promise
                       .then(() => this._connect())
                       // `_connect()` should never throw.
                       .catch(neverThrows);
                 });

                 this._connectPromise = undefined;
                 this.emit('connect', {connection, url: originalUrl});

                 // Need to return null here, or Bluebird will complain - #171.
                 return null;
             })

        } catch (err: any) {
            this.emit('connectFailed', {err, url: this._attemptedUrl});

            // Connection failed...
            this._currentConnection = undefined;
            this._connectPromise = undefined;

            let handle;
            if (err.name === 'OperationalError' && err.message === 'connect ETIMEDOUT') {
                handle = wait(0);
            } else {
                handle = wait(this.reconnectTimeInSeconds * 1000);
            }

            // Connect RetriesHandler
            this._cancelRetriesHandler = handle.cancel;

            return handle.promise.then(() => this._connect());
        }
    }
}

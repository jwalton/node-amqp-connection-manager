/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { Connection, Message, Options, Replies } from 'amqplib';
import { EventEmitter, once } from 'events';
import { IAmqpConnectionManager } from '../src/AmqpConnectionManager';
import ChannelWrapper, { CreateChannelOpts } from '../src/ChannelWrapper';

export class FakeAmqp {
    public connection: Connection | undefined;
    public url: string | undefined;
    public failConnections = false;
    public deadServers: string[] = [];
    public connect: (url: string) => Promise<Connection> = async () => {
        throw new Error('Not setup');
    };

    constructor() {
        this.reset();
    }

    kill() {
        const err = new Error('Died in a fire');
        this.connection?.emit('error', err);
        this.connection?.emit('close', err);
    }

    simulateRemoteClose() {
        this.connection?.emit('close', new Error('Connection closed'));
    }

    simulateRemoteBlock() {
        this.connection?.emit('blocked', new Error('Connection blocked'));
    }

    simulateRemoteUnblock() {
        this.connection?.emit('unblocked');
    }

    reset() {
        this.connection = undefined;
        this.url = undefined;
        this.failConnections = false;
        this.deadServers = [];
        this.connect = jest.fn().mockImplementation((url) => {
            if (this.failConnections) {
                return Promise.reject(new Error('No'));
            }

            let allowConnection = true;
            this.deadServers.forEach((deadUrl) => {
                if (url.startsWith(deadUrl)) {
                    allowConnection = false;
                }
            });
            if (!allowConnection) {
                return Promise.reject(new Error(`Dead server ${url}`));
            }

            const connection = (this.connection = new exports.FakeConnection(url));
            return Promise.resolve(connection);
        });
    }
}

export class FakeChannel extends EventEmitter {
    publish = jest
        .fn()
        .mockImplementation(
            (
                _exchange: string,
                _routingKey: string,
                content: Buffer,
                _options?: Options.Publish
            ): boolean => {
                this.emit('publish', content);
                return true;
            }
        );

    sendToQueue = jest
        .fn()
        .mockImplementation(
            (_queue: string, content: Buffer, _options?: Options.Publish): boolean => {
                this.emit('sendToQueue', content);
                return true;
            }
        );

    ack = jest.fn().mockImplementation(function (_message: Message, _allUpTo?: boolean): void {});

    ackAll = jest.fn().mockImplementation(function (): void {});

    nack = jest
        .fn()
        .mockImplementation(function (
            _message: Message,
            _allUpTo?: boolean,
            _requeue?: boolean
        ): void {});

    nackAll = jest.fn().mockImplementation(function (_requeue?: boolean): void {});

    assertQueue = jest
        .fn()
        .mockImplementation(async function (
            queue: string,
            _options?: Options.AssertQueue
        ): Promise<Replies.AssertQueue> {
            return {
                queue,
                messageCount: 0,
                consumerCount: 0,
            };
        });

    checkQueue = jest
        .fn()
        .mockImplementation(async function (_queue: string): Promise<Replies.Empty> {
            return {};
        });

    bindQueue = jest
        .fn()
        .mockImplementation(async function (
            _queue: string,
            _source: string,
            _pattern: string,
            _args?: any
        ): Promise<Replies.Empty> {
            return {};
        });

    assertExchange = jest
        .fn()
        .mockImplementation(async function (
            exchange: string,
            _type: 'direct' | 'topic' | 'headers' | 'fanout' | 'match' | string,
            _options?: Options.AssertExchange
        ): Promise<Replies.AssertExchange> {
            return { exchange };
        });

    bindExchange = jest
        .fn()
        .mockImplementation(async function (
            _destination: string,
            _source: string,
            _pattern: string,
            _args?: any
        ): Promise<Replies.Empty> {
            return {};
        });

    checkExchange = jest
        .fn()
        .mockImplementation(async function (_exchange: string): Promise<Replies.Empty> {
            return {};
        });

    deleteExchange = jest
        .fn()
        .mockImplementation(async function (
            _exchange: string,
            _options?: Options.DeleteExchange
        ): Promise<Replies.Empty> {
            return {};
        });

    unbindExchange = jest
        .fn()
        .mockImplementation(async function (
            _destination: string,
            _source: string,
            _pattern: string,
            _args?: any
        ): Promise<Replies.Empty> {
            return {};
        });

    close = jest.fn().mockImplementation(async (): Promise<void> => {
        this.emit('close');
    });

    consume = jest.fn().mockImplementation(async (): Promise<Replies.Consume> => {
        return { consumerTag: 'abc' };
    });

    prefetch = jest.fn().mockImplementation((_prefetch: number, _isGlobal: boolean): void => {});
}

export class FakeConfirmChannel extends FakeChannel {
    publish = jest
        .fn()
        .mockImplementation(
            (
                _exchange: string,
                _routingKey: string,
                content: Buffer,
                _options?: Options.Publish,
                callback?: (err: any, ok: Replies.Empty) => void
            ): boolean => {
                this.emit('publish', content);
                callback?.(null, {});
                return true;
            }
        );

    sendToQueue = jest
        .fn()
        .mockImplementation(
            (
                _queue: string,
                content: Buffer,
                _options?: Options.Publish,
                callback?: (err: any, ok: Replies.Empty) => void
            ): boolean => {
                this.emit('sendToQueue', content);
                callback?.(null, {});
                return true;
            }
        );
}

export class FakeConnection extends EventEmitter {
    url: string;
    _closed = false;

    constructor(url: string) {
        super();
        this.url = url;
        this._closed = false;
    }

    createChannel() {
        return Promise.resolve(new exports.FakeChannel());
    }

    createConfirmChannel() {
        return Promise.resolve(new exports.FakeConfirmChannel());
    }

    close() {
        this._closed = true;
        return Promise.resolve();
    }
}

export class FakeAmqpConnectionManager extends EventEmitter implements IAmqpConnectionManager {
    connected: boolean;
    private _connection: FakeConnection | undefined;

    heartbeatIntervalInSeconds = 5;
    reconnectTimeInSeconds = 10;

    constructor() {
        super();
        this.connected = false;
    }

    get connection() {
        return this._connection as any as Connection | undefined;
    }

    get channelCount(): number {
        return 0;
    }

    async connect(): Promise<void> {
        await Promise.all([once(this, 'connect'), this.simulateConnect()]);
    }

    reconnect(): void {
        this.simulateDisconnect();
        this.simulateConnect();
    }

    isConnected() {
        return this.connected;
    }

    createChannel(options?: CreateChannelOpts): ChannelWrapper {
        return new ChannelWrapper(this, options);
    }

    simulateConnect() {
        const url = 'amqp://localhost';
        this._connection = new exports.FakeConnection(url);
        this.connected = true;
        this.emit('connect', {
            connection: this.connection,
            url,
        });
    }

    simulateRemoteCloseEx(err: Error) {
        this.emit('disconnect', { err });
        this.emit('close', err);
    }

    simulateDisconnect() {
        this._connection = undefined;
        this.connected = false;
        this.emit('disconnect', {
            err: new Error('Boom!'),
        });
    }

    async close() {}
}

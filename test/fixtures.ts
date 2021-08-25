/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { ConfirmChannel, Connection } from 'amqplib';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
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
        this.connect = sinon.spy((url) => {
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

export class FakeConfirmChannel extends EventEmitter {
    publish: ConfirmChannel['publish'];
    sendToQueue: ConfirmChannel['sendToQueue'];
    ack: ConfirmChannel['ack'];
    ackAll: ConfirmChannel['ackAll'];
    nack: ConfirmChannel['nack'];
    nackAll: ConfirmChannel['nackAll'];
    assertQueue: ConfirmChannel['assertQueue'];
    bindQueue: ConfirmChannel['bindQueue'];
    assertExchange: ConfirmChannel['assertExchange'];
    close: ConfirmChannel['close'];

    constructor() {
        super();
        this.publish = sinon.spy((_exchage, _routingKey, content, _options, callback) => {
            this.emit('publish', content);
            callback(null);
            return true;
        });

        this.sendToQueue = sinon.spy((_queue, content, _options, callback) => {
            this.emit('sendToQueue', content);
            callback(null);
            return true;
        });

        this.ack = sinon.spy(function (_message, _allUpTo) {});

        this.ackAll = sinon.spy(function () {});

        this.nack = sinon.spy(function (_message, _allUpTo, _requeue) {});

        this.nackAll = sinon.spy(function (_requeue) {});

        this.assertQueue = sinon.spy(async function (queue, _options) {
            return {
                queue,
                messageCount: 0,
                consumerCount: 0,
            };
        }) as any as ConfirmChannel['assertQueue'];

        this.bindQueue = sinon.spy(async function (
            _queue,
            _source,
            _pattern,
            _args
        ) {}) as any as ConfirmChannel['bindQueue'];

        this.assertExchange = sinon.spy(async function (exchange, _type, _options) {
            return { exchange };
        }) as any as ConfirmChannel['assertExchange'];

        this.close = sinon.spy(async () => {
            this.emit('close');
        }) as any as ConfirmChannel['close'];
    }
}

export class FakeConnection extends EventEmitter {
    url: string;
    _closed = false;

    constructor(url: string) {
        super();
        this.url = url;
        this._closed = false;
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

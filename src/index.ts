/* eslint-disable @typescript-eslint/no-namespace */
import AmqpConnectionManager, {
    AmqpConnectionManagerOptions,
    ConnectionUrl,
    IAmqpConnectionManager,
} from './AmqpConnectionManager.js';
import { PublishOptions } from './ChannelWrapper.js';

export type {
    AmqpConnectionManagerOptions,
    ConnectionUrl,
    IAmqpConnectionManager as AmqpConnectionManager,
} from './AmqpConnectionManager.js';
export type {
    CreateChannelOpts,
    SetupFunc,
    Channel,
} from './ChannelWrapper.js';
export { default as ChannelWrapper } from './ChannelWrapper.js';

import { Options as AmqpLibOptions } from 'amqplib';

export namespace Options {
    export type Connect = AmqpLibOptions.Connect;
    export type AssertQueue = AmqpLibOptions.AssertQueue;
    export type DeleteQueue = AmqpLibOptions.DeleteQueue;
    export type AssertExchange = AmqpLibOptions.AssertExchange;
    export type DeleteExchange = AmqpLibOptions.DeleteExchange;
    export type Publish = PublishOptions;
    export type Consume = AmqpLibOptions.Consume;
    export type Get = AmqpLibOptions.Get;
}

export function connect(
    urls: ConnectionUrl | ConnectionUrl[] | undefined | null,
    options?: AmqpConnectionManagerOptions
): IAmqpConnectionManager {
    const conn = new AmqpConnectionManager(urls, options);
    conn.connect().catch(() => {
        /* noop */
    });
    return conn;
}

export { AmqpConnectionManager as AmqpConnectionManagerClass };

const amqp = { connect };

export default amqp;

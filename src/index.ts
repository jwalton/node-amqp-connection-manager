import AmqpConnectionManager, {
    AmqpConnectionManagerOptions,
    ConnectionUrl,
    IAmqpConnectionManager,
} from './AmqpConnectionManager.js';

export type {
    AmqpConnectionManagerOptions,
    ConnectionUrl,
    IAmqpConnectionManager as AmqpConnectionManager,
} from './AmqpConnectionManager.js';
export type {
    CreateChannelOpts,
    default as ChannelWrapper,
    SetupFunc,
    Channel,
} from './ChannelWrapper.js';

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

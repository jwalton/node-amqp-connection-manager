import AmqpConnectionManager, { AmqpConnectionManagerOptions } from './AmqpConnectionManager.js';

export type {
    AmqpConnectionManagerOptions,
    default as AmqpConnectionManager,
} from './AmqpConnectionManager.js';

export type { SetupFunc, CreateChannelOpts, default as ChannelWrapper } from './ChannelWrapper.js';

export function connect(
    urls: string[],
    options: AmqpConnectionManagerOptions
): AmqpConnectionManager {
    return new AmqpConnectionManager(urls, options);
}

const amqp = { connect };

export default amqp;

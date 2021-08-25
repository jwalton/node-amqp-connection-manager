import AmqpConnectionManager, {
    AmqpConnectionManagerOptions,
    IAmqpConnectionManager,
} from './AmqpConnectionManager.js';

export type {
    AmqpConnectionManagerOptions,
    IAmqpConnectionManager as AmqpConnectionManager,
} from './AmqpConnectionManager.js';

export type { SetupFunc, CreateChannelOpts, default as ChannelWrapper } from './ChannelWrapper.js';

export function connect(
    urls: string[],
    options: AmqpConnectionManagerOptions
): IAmqpConnectionManager {
    return new AmqpConnectionManager(urls, options);
}

const amqp = { connect };

export default amqp;

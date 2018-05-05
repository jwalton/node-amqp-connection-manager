import AmqpConnectionManager from './AmqpConnectionManager';

export function connect(urls, options) {
    return new AmqpConnectionManager(urls, options);
}
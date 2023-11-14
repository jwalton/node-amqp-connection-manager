import {AmqpConnectionManager, AmqpConnectionManagerOptions, ConnectionUrl} from "./decorate";
import {ChannelWrapper, CreateChannelOptions} from "./decorate";

/**
 * Connect and maintain to the RabbitMQ System
 * @since 1.0.0
 * @description Connects to the RabbitMQ Instance and will maintain to the RabbitMQ System.
 * That is if it does not fail off.
 * @param urls {ConnectionUrl} A string of the URL to the RabbitMQ Server or an Array
 * @param options {AmqpConnectionManagerOptions} Options for the connection.
 * @returns {Promise<AmqpConnectionManager>}
 */
const connect = async (urls: ConnectionUrl, options?: AmqpConnectionManagerOptions): Promise<AmqpConnectionManager> => {
  const conn = new AmqpConnectionManager(urls, options);
  await conn.connect().catch(() => {
    /* noop */
  });
  return conn;
}

const amqp = {connect};

export {AmqpConnectionManager, ChannelWrapper, AmqpConnectionManagerOptions, CreateChannelOptions}

export default amqp;
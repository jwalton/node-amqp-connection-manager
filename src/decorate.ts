import * as amqplib from "amqplib";
import {Connection, ConsumeMessage, Options} from 'amqplib';
import {TcpSocketConnectOpts} from "net";
import {ConnectionOptions} from "tls";
import ChannelWrapper from "./ChannelWrapper";
import AmqpConnectionManager from  "./AmqpConnectionManager"

/**
 * AmqpConnectionOptions
 * @since 1.0.0
 * @implements {ConnectionOptions | TcpSocketConnectOpts}
 */
export type AmqpConnectionOptions = (ConnectionOptions | TcpSocketConnectOpts) & {
  clientProperties?: any;
  /* User Credentials to Connect to RabbitMQ  */
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
  /* If URLs are empty. We will use this method instead. Useful for generating dynamic connections. */
  findServers?:
    | ((callback: (urls: any | any[]) => void) => void)
    | (() => Promise<any | any[]>)
    | undefined;
  /* How often to check, in seconds, to make sure the broker/RabbitMQ service is still alive. Default is 5 seconds. */
  heartbeatIntervalInSeconds?: number;
  /* Force to keep the connection alive. */
  keepAlive?: boolean;
  /* How many seconds to wait before we try again to force connecting. */
  keepAliveDelay?: number;
  /* ??? */
  noDelay?: boolean;
  /* How often in seconds to try and reconnect before moving to the next server. Default is 5 seconds. */
  reconnectTimeInSeconds?: number;
  /* How long to timeout in milliseconds when to stop trying to connect. */
  timeout?: number;
};

export interface ConnectListener {
  (arg: { connection: Connection; url: string | Options.Connect }): void;
}

export interface ConnectFailedListener {
  (arg: { err: Error; url: string | Options.Connect | undefined }): void;
}

/**
 * Implements AmqpConnectionManager
 * @since 1.0.0
 * @implements AmqpConnectionManager
 */
export interface IAmqpConnectionManager {

  connectionOptions: AmqpConnectionOptions | undefined;
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
  createChannel(options?: CreateChannelOptions): ChannelWrapper;
  findChannel(name: string): ChannelWrapper | undefined;
  close(): Promise<void>;
  isConnected(): boolean;

  /** The current connection. */
  readonly connection: Connection | undefined;

  /** Returns the number of registered channels. */
  readonly channelCount: number;
}

/**
 * Implements ChannelWrapper
 * @since 1.0.0
 * @implements ChannelWrapper
 */
export interface IChannelWrapper {

  name?: string;

  addListener(event: string, listener: (...args: any[]) => void): this;
  addListener(event: 'connect', listener: () => void): this;
  addListener(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
  addListener(event: 'close', listener: () => void): this;
  on(event: string, listener: (...args: any[]) => void): this;

  on(event: string, listener: (...args: any[]) => void): this;
  on(event: 'connect', listener: () => void): this;
  on(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
  on(event: 'close', listener: () => void): this;
  once(event: string, listener: (...args: any[]) => void): this;

  prependListener(event: string, listener: (...args: any[]) => void): this;
  prependListener(event: 'connect', listener: () => void): this;
  prependListener(event: 'error', listener: (err: Error, info: { name: string }) => void): this;
  prependListener(event: 'close', listener: () => void): this;
  prependListener(event: string, listener: (...args: any[]) => void): this;

  prependOnceListener(event: string, listener: (...args: any[]) => void): this;
  prependOnceListener(event: 'connect', listener: () => void): this;
  prependOnceListener(
    event: 'error',
    listener: (err: Error, info: { name: string }) => void
  ): this;
  prependOnceListener(event: 'close', listener: () => void): this;
  prependOnceListener(event: string, listener: (...args: any[]) => void): this;

}

export type Channel = amqplib.ConfirmChannel | amqplib.Channel;

export type SetupFunc =
  | ((channel: Channel, callback: (error?: Error) => void) => void)
  | ((channel: Channel) => Promise<void>)
  | ((channel: amqplib.ConfirmChannel, callback: (error?: Error) => void) => void)
  | ((channel: amqplib.ConfirmChannel) => Promise<void>);

export interface AmqpConnectionManagerOptions {
  connectionOptions?: AmqpConnectionOptions;
}

export interface CreateChannelOptions {
  /**  Name for this channel. Used for debugging. */
  name?: string;
  /**
   * A function to call whenever we reconnect to the broker (and therefore create a new underlying channel.)
   * This function should either accept a callback, or return a Promise. See addSetup below
   */
  setup?: SetupFunc;
  /**
   * True to create a ConfirmChannel (default). False to create a regular Channel.
   */
  confirm?: boolean;
  /**
   * if true, then ChannelWrapper assumes all messages passed to publish() and sendToQueue() are plain JSON objects.
   * These will be encoded automatically before being sent.
   */
  json?: boolean;
  /**
   * Default publish timeout in ms. Messages not published within the given time are rejected with a timeout error.
   */
  publishTimeout?: number;
}

export interface PublishMessage {
  type: 'publish';
  exchange: string;
  routingKey: string;
  content: Buffer;
  options?: Options.Publish;
  resolve: (result: boolean) => void;
  reject: (err: Error) => void;
  timeout?: NodeJS.Timeout;
  isTimedOut: boolean;
}

export interface SendToQueueMessage {
  type: 'sendToQueue';
  queue: string;
  content: Buffer;
  options?: Options.Publish;
  resolve: (result: boolean) => void;
  reject: (err: Error) => void;
  timeout?: NodeJS.Timeout;
  isTimedOut: boolean;
}

export type Message = PublishMessage | SendToQueueMessage;

export interface PublishOptions extends Options.Publish {
  /** The Message will be rejected after timeout ms. */
  timeout?: number;
}

export interface ConsumerOptions extends amqplib.Options.Consume {
  prefetch?: number;
}

export interface Consumer {
  consumerTag: string | null;
  queue: string;
  onMessage: (msg: ConsumeMessage) => void;
  options: ConsumerOptions;
}

export { AmqpConnectionManager, ChannelWrapper };
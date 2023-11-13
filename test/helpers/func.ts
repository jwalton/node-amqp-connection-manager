import * as amqplib from "amqplib";
import ChannelWrapper from "../../src/ChannelWrapper";
import * as fixtures from "./fixtures";

export function makeMessage(content: string): amqplib.Message {
  return {
    content: Buffer.from(content),
    fields: {
      deliveryTag: 0,
      exchange: 'exchange',
      redelivered: false,
      routingKey: 'routingKey',
    },
    properties: {
      headers: {},
    } as any,
  };
}

export function getUnderlyingChannel(
  channelWrapper: ChannelWrapper
): fixtures.FakeConfirmChannel | fixtures.FakeChannel {
  const channel = (channelWrapper as any)._channel;
  if (!channel) {
    throw new Error('No underlying channel');
  }
  return channel;
}
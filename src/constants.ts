import crypto from "crypto";
import {promisify} from "util";

/**
 * Hard Coded Heartbeat Manager
 * 5 Seconds for Production (default). Zero seconds for development and unit testing.
 * It can be overridden.
 * @since 1.0.0
 * @returns number
 */
export const AMQP_MANAGER_HEARTBEAT_IN_SECONDS = process.env.NODE_ENV !== 'test' ? 5 : 0;

/**
 * The max messages to send by default. Currently set at 1000. Can be overridden.
 * @since 1.0.0
 * @returns number
 */
export const CHANNEL_MAX_MESSAGES_PER_BATCH = 1000;


export const CHANNEL_IRRECOVERABLE_ERRORS = [
  403, // AMQP Access Refused Error.
  404, // AMQP Not Found Error.
  406, // AMQP Precondition Failed Error.
  501, // AMQP Frame Error.
  502, // AMQP Frame Syntax Error.
  503, // AMQP Invalid Command Error.
  504, // AMQP Channel Not Open Error.
  505, // AMQP Unexpected Frame.
  530, // AMQP Not Allowed Error.
  540, // AMQP Not Implemented Error.
  541, // AMQP Internal Error.
];

export const randomBytes = promisify(crypto.randomBytes);

/**
 * Wait
 * @since 1.0.0
 * @description Creates a wait function for something to happen.
 * @returns {Promise<AmqpConnectionManager>}
 * @param timeInMs
 */
export function wait(timeInMs: number): { promise: Promise<void>; cancel: () => void } {
    let timeoutHandle: NodeJS.Timeout;

    return {
        promise: new Promise<void>(function (resolve) {
            timeoutHandle = setTimeout(resolve, timeInMs);
        }),
        cancel: () => clearTimeout(timeoutHandle),
    };
}

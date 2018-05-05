export function wait(timeInMs) {
    return new Promise(function(resolve) {
        return setTimeout(resolve, timeInMs);
    });
}
export function wait(timeInMs) {
  let timeoutHandle;

  const promise = () => {
    return new Promise(function (resolve) {
      timeoutHandle = setTimeout(resolve, timeInMs);
      return timeoutHandle;
    });
  };

  return { promise, cancel: () => clearTimeout(timeoutHandle) };
}

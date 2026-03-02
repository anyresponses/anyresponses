export function streamFromAsyncIterable(iterable) {
  const iterator = iterable[Symbol.asyncIterator]();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      const chunk = typeof value === "string" ? encoder.encode(value) : value;
      controller.enqueue(chunk);
    },
    async cancel() {
      if (typeof iterator.return === "function") {
        await iterator.return();
      }
    },
  });
}

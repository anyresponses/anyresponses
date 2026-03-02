const { registerAdapter, getAdapter, listAdapters } = require("./registry");
const { convertResponse, convertStream } = require("./convert");
const { AdapterNotFoundError } = require("./errors");
const { AnyResponses, PROVIDERS } = require("./client/openresponses");
const { eventsToSSE } = require("./stream/sse");

module.exports = {
  registerAdapter,
  getAdapter,
  listAdapters,
  convertResponse,
  convertStream,
  AdapterNotFoundError,
  AnyResponses,
  PROVIDERS,
  eventsToSSE,
};

const { getAdapter } = require("./registry");
const { AdapterNotFoundError } = require("./errors");

function convertResponse(provider, input, options = {}) {
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.toOpenResponse !== "function") {
    throw new AdapterNotFoundError(provider);
  }
  return adapter.toOpenResponse(input, options);
}

function convertStream(provider, input, options = {}) {
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.toOpenStream !== "function") {
    throw new AdapterNotFoundError(provider);
  }
  return adapter.toOpenStream(input, options);
}

module.exports = {
  convertResponse,
  convertStream,
};

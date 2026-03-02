const adapters = new Map();

function registerAdapter(provider, adapter) {
  if (!provider || typeof provider !== "string") {
    throw new TypeError("provider must be a non-empty string");
  }
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("adapter must be an object");
  }
  adapters.set(provider, adapter);
}

function getAdapter(provider) {
  return adapters.get(provider);
}

function listAdapters() {
  return Array.from(adapters.keys());
}

module.exports = {
  registerAdapter,
  getAdapter,
  listAdapters,
};

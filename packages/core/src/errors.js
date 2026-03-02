class AdapterNotFoundError extends Error {
  constructor(provider) {
    super(`Adapter not found for provider: ${provider}`);
    this.name = "AdapterNotFoundError";
  }
}

module.exports = {
  AdapterNotFoundError,
};

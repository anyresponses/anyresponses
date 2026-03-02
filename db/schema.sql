CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id
  ON oauth_accounts (user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (api_key)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
  ON api_keys (user_id);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  options_json TEXT NOT NULL,
  always_use INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_integrations_user_id
  ON integrations (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_user_integration_id
  ON integrations (user_id, integration_id);

CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  routes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_rules_model_id
  ON routing_rules (model_id);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  integration_id TEXT NOT NULL DEFAULT 'anyresponses',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  stream INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL,
  response_status TEXT,
  finish_reason TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd INTEGER,
  feedback INTEGER,
  feedback_text TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_id
  ON request_logs (api_key_id);

CREATE INDEX IF NOT EXISTS idx_request_logs_user_id
  ON request_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at
  ON request_logs (created_at);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  cost_usd INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_user_id
  ON billing_events (user_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_api_key_id
  ON billing_events (api_key_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_created_at
  ON billing_events (created_at);

CREATE TABLE IF NOT EXISTS credit_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (stripe_session_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_topups_user_id
  ON credit_topups (user_id);

CREATE INDEX IF NOT EXISTS idx_credit_topups_created_at
  ON credit_topups (created_at);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  author TEXT,
  name TEXT,
  summary TEXT,
  context_length INTEGER,
  created INTEGER,
  prompt_price REAL,
  completion_price REAL,
  payload TEXT,
  acceptance_tests TEXT
);

CREATE INDEX IF NOT EXISTS idx_models_author ON models(author);

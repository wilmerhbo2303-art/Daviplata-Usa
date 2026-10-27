CREATE TABLE IF NOT EXISTS davi_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_encrypted TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  display_balance REAL,
  premium_expires_at INTEGER,
  premium_enabled INTEGER NOT NULL DEFAULT 0,
  bold_expires_at INTEGER,
  bold_enabled INTEGER NOT NULL DEFAULT 0,
  sms_credits INTEGER NOT NULL DEFAULT 0,
  sms_enabled INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  is_trial INTEGER NOT NULL DEFAULT 0,
  trial_expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS davi_account_state (
  profile_id TEXT PRIMARY KEY REFERENCES davi_profiles(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS davi_auth_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS davi_profiles_phone_idx ON davi_profiles(phone);
CREATE INDEX IF NOT EXISTS davi_profiles_document_idx ON davi_profiles(document_type, document_number);
CREATE INDEX IF NOT EXISTS davi_profiles_trial_expiry_idx ON davi_profiles(is_trial, trial_expires_at);

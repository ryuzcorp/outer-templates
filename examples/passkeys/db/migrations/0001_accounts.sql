-- Passkey accounts, credentials, challenges, and sessions.
CREATE TABLE account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  user_handle TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE credential (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX credential_account ON credential (account_id);
CREATE TABLE challenge (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  account_id INTEGER REFERENCES account (id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

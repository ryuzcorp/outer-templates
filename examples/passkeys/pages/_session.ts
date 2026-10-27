// Passkey sessions: D1-backed tokens in an HttpOnly cookie.
//
// The cookie holds a random token; D1 keeps only its SHA-256 hash, so a
// database read alone never yields a usable session. `getViewer` is the
// "who am I" helper other pages import: it turns the request cookies into
// the signed-in account, or null. No `cloudflare:workers` import here —
// server modules pass `env.DB` in, which keeps this file (and its cookie
// helpers) runnable in plain `bun test`.
import type { D1Database } from "@cloudflare/workers-types";

import { randomB64url, sha256 } from "./_webauthn.ts";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export interface Viewer {
  id: number;
  handle: string;
  displayName: string;
}

// Creates the tables if the migration has not run yet — `vite preview`
// serves without running migrations, while dev startup and deploys apply
// `db/migrations/`. `IF NOT EXISTS` keeps both paths in agreement. The
// schema matches `db/migrations/0001_accounts.sql`.
export async function ensureAuthTables(db: D1Database): Promise<D1Database> {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY AUTOINCREMENT, handle TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, user_handle TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL DEFAULT (unixepoch()))",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS credential (id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE, public_key TEXT NOT NULL, algorithm INTEGER NOT NULL, sign_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS credential_account ON credential (account_id)"),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS challenge (id TEXT PRIMARY KEY, kind TEXT NOT NULL, account_id INTEGER REFERENCES account (id) ON DELETE CASCADE, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS session (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)",
    ),
  ]);
  return db;
}

export function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === "https:";
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const cut = part.indexOf("=");
    if (cut < 0) {
      continue;
    }
    if (part.slice(0, cut).trim() === name) {
      const value = part.slice(cut + 1).trim();
      return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    }
  }
  return null;
}

function serializeSessionCookie(token: string, maxAge: number, secure: boolean): string {
  let cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  // `Secure` cookies are never sent over http://localhost, so local preview
  // would sign in and then look signed out. Send `Secure` in production
  // (https) and leave it off for plain http. See the README gotchas.
  if (secure) {
    cookie += "; Secure";
  }
  return cookie;
}

export function sessionCookie(token: string, secure: boolean): string {
  return serializeSessionCookie(token, SESSION_MAX_AGE, secure);
}

// Clearing must carry the same flags the cookie was set with, or the browser
// keeps the old one — so expiry takes `secure` from the request too.
export function expireSessionCookie(secure: boolean): string {
  return serializeSessionCookie("", 0, secure);
}

async function tokenHash(token: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(token));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  db: D1Database,
  accountId: number,
  secure: boolean,
): Promise<string> {
  const token = randomB64url(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  await db
    .prepare("INSERT INTO session (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
    .bind(await tokenHash(token), accountId, expiresAt)
    .run();
  return sessionCookie(token, secure);
}

// Deletes the session for this request's cookie and answers the expired
// cookie the action puts on its `Set-Cookie` response header.
export async function destroySession(
  db: D1Database,
  cookieHeader: string | null,
  secure: boolean,
): Promise<string> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token) {
    await db
      .prepare("DELETE FROM session WHERE token_hash = ?")
      .bind(await tokenHash(token))
      .run();
  }
  return expireSessionCookie(secure);
}

interface ViewerRow {
  id: number;
  handle: string;
  displayName: string;
  expiresAt: number;
}

export async function getViewer(
  db: D1Database,
  cookieHeader: string | null,
): Promise<Viewer | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) {
    return null;
  }
  const row = await db
    .prepare(
      "SELECT account.id AS id, account.handle AS handle, account.display_name AS displayName, session.expires_at AS expiresAt FROM session JOIN account ON account.id = session.account_id WHERE session.token_hash = ?",
    )
    .bind(await tokenHash(token))
    .first<ViewerRow>();
  if (!row) {
    return null;
  }
  if (row.expiresAt <= Math.floor(Date.now() / 1000)) {
    await db
      .prepare("DELETE FROM session WHERE token_hash = ?")
      .bind(await tokenHash(token))
      .run();
    return null;
  }
  return { id: row.id, handle: row.handle, displayName: row.displayName };
}

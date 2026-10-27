// The sign-in page's server module. The loader only reports who is signed
// in; every passkey step runs through the action, which the page calls with
// plain `fetch` (the ceremonies need the JSON answers back, not a page
// re-render — returning `c.json()` from an action answers the fetch
// directly). One `intent` per step: `register-start`, `register-finish`,
// `login-start`, `login-finish`, `sign-out`.
import { env } from "cloudflare:workers";
import type { D1Database } from "@cloudflare/workers-types";
import { defineHandler, defineHead } from "void";

import { appBrand } from "./_brand.ts";
import { createSession, destroySession, ensureAuthTables, getViewer } from "./_session.ts";
import { randomB64url, verifyAuthentication, verifyRegistration } from "./_webauthn.ts";

export interface Props {
  viewer: { handle: string; displayName: string } | null;
}

// Challenges live five minutes and die on first use.
const CHALLENGE_TTL = 300;

interface ChallengePayload {
  challenge: string;
  username?: string;
  userId?: string;
  accountId?: number | null;
}

interface ChallengeRow {
  payload: string;
}

// Everything the page posts to the action. Fields stay `unknown` until the
// intent handler narrows them with `typeof` checks.
interface ActionBody {
  intent?: unknown;
  challengeId?: unknown;
  username?: unknown;
  id?: unknown;
  attestationObject?: unknown;
  clientDataJSON?: unknown;
  authenticatorData?: unknown;
  signature?: unknown;
  userHandle?: unknown;
}

function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Try again.";
}

function ceremonyHost(c: { req: { url: string } }): {
  rpId: string;
  origin: string;
  secure: boolean;
} {
  // rpId and origin come from the request host, so the same code works on
  // <slug>.outer.now, <slug>--preview.outer.now, localhost, and custom
  // domains. Nothing about the host is hardcoded anywhere.
  const url = new URL(c.req.url);
  return { rpId: url.hostname, origin: url.origin, secure: url.protocol === "https:" };
}

async function takeChallenge(
  db: D1Database,
  id: unknown,
  kind: string,
): Promise<ChallengePayload | null> {
  if (typeof id !== "string" || !id) {
    return null;
  }
  // Consume the challenge in the same statement that reads it: two
  // concurrent finishes with the same id must not both verify against it.
  const row = await db
    .prepare("DELETE FROM challenge WHERE id = ? AND kind = ? AND expires_at > ? RETURNING payload")
    .bind(id, kind, Math.floor(Date.now() / 1000))
    .first<ChallengeRow>();
  if (!row) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const challenge = "challenge" in parsed ? parsed.challenge : undefined;
  if (typeof challenge !== "string") {
    return null;
  }
  const username =
    "username" in parsed && typeof parsed.username === "string" ? parsed.username : undefined;
  const userId =
    "userId" in parsed && typeof parsed.userId === "string" ? parsed.userId : undefined;
  const accountId =
    "accountId" in parsed && typeof parsed.accountId === "number" ? parsed.accountId : null;
  return { challenge, username, userId, accountId };
}

export const loader = defineHandler(async (c): Promise<Props> => {
  const db = await ensureAuthTables(env.DB);
  const viewer = await getViewer(db, c.req.header("cookie") ?? null);
  return { viewer: viewer ? { handle: viewer.handle, displayName: viewer.displayName } : null };
});

export const head = defineHead(() => ({
  title: "Sign in",
  meta: [
    { name: "description", content: `Sign in to ${appBrand.name} with a passkey.` },
    { property: "og:title", content: `Sign in | ${appBrand.name}` },
  ],
}));

export const action = defineHandler(async (c) => {
  const body = await c.req.json<ActionBody>();
  const db = await ensureAuthTables(env.DB);
  const { rpId, origin, secure } = ceremonyHost(c);
  const now = Math.floor(Date.now() / 1000);

  if (body.intent === "register-start") {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!username) {
      return c.json({ error: "Enter a name for your account." }, 400);
    }
    if (username.length > 40) {
      return c.json({ error: "Keep your name to 40 characters or fewer." }, 400);
    }
    await db.prepare("DELETE FROM challenge WHERE expires_at <= ?").bind(now).run();
    const taken = await db
      .prepare("SELECT id FROM account WHERE handle = ? COLLATE NOCASE")
      .bind(username)
      .first<{ id: number }>();
    if (taken) {
      return c.json({ error: "That name is taken. Sign in instead." }, 409);
    }
    const challenge = randomB64url(32);
    const challengeId = randomB64url(16);
    const userId = randomB64url(16);
    await db
      .prepare("INSERT INTO challenge (id, kind, payload, expires_at) VALUES (?, 'register', ?, ?)")
      .bind(challengeId, JSON.stringify({ challenge, username, userId }), now + CHALLENGE_TTL)
      .run();
    return c.json({
      challengeId,
      options: {
        rp: { name: appBrand.name },
        user: { id: userId, name: username, displayName: username },
        challenge,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 60000,
        attestation: "none",
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        excludeCredentials: [],
      },
    });
  }

  if (body.intent === "register-finish") {
    const payload = await takeChallenge(db, body.challengeId, "register");
    if (!payload || !payload.username || !payload.userId) {
      return c.json({ error: "That sign-up challenge expired. Start again." }, 400);
    }
    if (typeof body.attestationObject !== "string" || typeof body.clientDataJSON !== "string") {
      return c.json({ error: "That passkey response was malformed. Try again." }, 400);
    }
    let verified;
    try {
      verified = await verifyRegistration(
        { attestationObject: body.attestationObject, clientDataJSON: body.clientDataJSON },
        { challenge: payload.challenge, origin, rpId },
      );
    } catch (error) {
      return c.json({ error: message(error) }, 400);
    }
    const clash = await db
      .prepare("SELECT id FROM credential WHERE id = ?")
      .bind(verified.credentialId)
      .first<{ id: string }>();
    if (clash) {
      return c.json({ error: "That passkey is already registered. Sign in instead." }, 409);
    }
    let accountId: number;
    try {
      // One transaction: if the credential insert fails (a duplicate id
      // raced past the clash check), the account rolls back with it, so
      // the handle is never left taken with no credential behind it.
      const [created] = await db.batch([
        db
          .prepare("INSERT INTO account (handle, display_name, user_handle) VALUES (?, ?, ?)")
          .bind(payload.username, payload.username, payload.userId),
        db
          .prepare(
            "INSERT INTO credential (id, account_id, public_key, algorithm, sign_count) SELECT ?, id, ?, ?, ? FROM account WHERE user_handle = ?",
          )
          .bind(
            verified.credentialId,
            verified.publicKey,
            verified.algorithm,
            verified.signCount,
            payload.userId,
          ),
      ]);
      accountId = Number(created.meta.last_row_id);
    } catch {
      return c.json({ error: "That name was just taken. Try another one." }, 409);
    }
    return c.json({ ok: true, handle: payload.username }, 200, {
      "Set-Cookie": await createSession(db, accountId, secure),
    });
  }

  if (body.intent === "login-start") {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    await db.prepare("DELETE FROM challenge WHERE expires_at <= ?").bind(now).run();
    let accountId: number | null = null;
    const allowCredentials: { type: string; id: string }[] = [];
    if (username) {
      const account = await db
        .prepare("SELECT id FROM account WHERE handle = ? COLLATE NOCASE")
        .bind(username)
        .first<{ id: number }>();
      if (!account) {
        return c.json({ error: "No account with that name. Create one first." }, 404);
      }
      accountId = account.id;
      const credentials = await db
        .prepare("SELECT id FROM credential WHERE account_id = ?")
        .bind(account.id)
        .all<{ id: string }>();
      for (const credential of credentials.results ?? []) {
        allowCredentials.push({ type: "public-key", id: credential.id });
      }
    }
    const challenge = randomB64url(32);
    const challengeId = randomB64url(16);
    await db
      .prepare("INSERT INTO challenge (id, kind, payload, expires_at) VALUES (?, 'login', ?, ?)")
      .bind(challengeId, JSON.stringify({ challenge, accountId }), now + CHALLENGE_TTL)
      .run();
    return c.json({
      challengeId,
      options: {
        challenge,
        rpId,
        timeout: 60000,
        userVerification: "preferred",
        ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
      },
    });
  }

  if (body.intent === "login-finish") {
    const payload = await takeChallenge(db, body.challengeId, "login");
    if (!payload) {
      return c.json({ error: "That sign-in challenge expired. Start again." }, 400);
    }
    if (
      typeof body.id !== "string" ||
      typeof body.authenticatorData !== "string" ||
      typeof body.clientDataJSON !== "string" ||
      typeof body.signature !== "string"
    ) {
      return c.json({ error: "That passkey response was malformed. Try again." }, 400);
    }
    interface NamedCredential {
      publicKey: string;
      algorithm: number;
      signCount: number;
    }
    interface DiscoverableCredential extends NamedCredential {
      accountId: number;
      userHandle: string;
    }
    let credential: NamedCredential;
    let accountId: number;
    if (payload.accountId == null) {
      const stored = await db
        .prepare(
          "SELECT credential.public_key AS publicKey, credential.algorithm AS algorithm, credential.sign_count AS signCount, credential.account_id AS accountId, account.user_handle AS userHandle FROM credential JOIN account ON account.id = credential.account_id WHERE credential.id = ?",
        )
        .bind(body.id)
        .first<DiscoverableCredential>();
      if (!stored) {
        return c.json(
          { error: "That passkey is not registered here. Create an account first." },
          400,
        );
      }
      if (typeof body.userHandle === "string" && body.userHandle !== stored.userHandle) {
        return c.json({ error: "That passkey belongs to a different account. Try again." }, 400);
      }
      credential = {
        publicKey: stored.publicKey,
        algorithm: stored.algorithm,
        signCount: stored.signCount,
      };
      accountId = stored.accountId;
    } else {
      const stored = await db
        .prepare(
          "SELECT public_key AS publicKey, algorithm, sign_count AS signCount FROM credential WHERE id = ? AND account_id = ?",
        )
        .bind(body.id, payload.accountId)
        .first<NamedCredential>();
      if (!stored) {
        return c.json(
          { error: "That passkey is not registered here. Create an account first." },
          400,
        );
      }
      credential = stored;
      accountId = payload.accountId;
    }
    let signCount: number;
    try {
      ({ signCount } = await verifyAuthentication(
        {
          authenticatorData: body.authenticatorData,
          clientDataJSON: body.clientDataJSON,
          signature: body.signature,
        },
        { challenge: payload.challenge, origin, rpId },
        {
          publicKey: credential.publicKey,
          algorithm: credential.algorithm,
          signCount: credential.signCount,
        },
      ));
    } catch (error) {
      return c.json({ error: message(error) }, 400);
    }
    await db
      .prepare("UPDATE credential SET sign_count = ? WHERE id = ?")
      .bind(signCount, body.id)
      .run();
    return c.json({ ok: true }, 200, { "Set-Cookie": await createSession(db, accountId, secure) });
  }

  if (body.intent === "sign-out") {
    return c.json({ ok: true }, 200, {
      "Set-Cookie": await destroySession(db, c.req.header("cookie") ?? null, secure),
    });
  }

  return c.json({ error: "Unknown action. Try again." }, 400);
});

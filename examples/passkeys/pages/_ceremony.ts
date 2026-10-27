// Browser helpers for the passkey ceremonies. The sign-in page calls these
// from its buttons: each one starts a ceremony with the sign-in action,
// talks to the device with `navigator.credentials`, and finishes with the
// action again. Plain `fetch` (not a Void form) carries the JSON both ways.
import { b64urlDecode, b64urlEncode } from "./_webauthn.ts";

export function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  return b64urlEncode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return b64urlDecode(value);
}

async function postIntent<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Something went wrong. Try again.";
    throw new Error(message);
  }
  return data as T;
}

interface StartAnswer<T> {
  challengeId: string;
  options: T;
}

interface RegistrationOptions {
  rp: { name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  authenticatorSelection: AuthenticatorSelectionCriteria;
  excludeCredentials: { type: "public-key"; id: string }[];
}

interface LoginOptions {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: UserVerificationRequirement;
  allowCredentials?: { type: "public-key"; id: string }[];
}

export function friendlyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "That was cancelled. Tap again when you are ready.";
    }
    if (error.name === "InvalidStateError") {
      return "This device already has a passkey here. Sign in instead.";
    }
    if (error.name === "NotSupportedError") {
      return "This browser or device cannot use passkeys. Try another one.";
    }
    if (error.message) {
      return error.message;
    }
  }
  return "Something went wrong. Try again.";
}
export async function registerWithPasskey(username: string): Promise<void> {
  const start = await postIntent<StartAnswer<RegistrationOptions>>({
    intent: "register-start",
    username,
  });
  const options = start.options;
  const created = await navigator.credentials.create({
    publicKey: {
      rp: options.rp,
      user: { ...options.user, id: b64urlToBytes(options.user.id) },
      challenge: b64urlToBytes(options.challenge),
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: "none",
      authenticatorSelection: options.authenticatorSelection,
      excludeCredentials: options.excludeCredentials.map((entry) => ({
        type: entry.type,
        id: b64urlToBytes(entry.id),
      })),
    },
  });
  if (!(created instanceof PublicKeyCredential)) {
    throw new Error("Your device did not make a passkey. Try again.");
  }
  if (!(created.response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("Your device did not return a new passkey. Try again.");
  }
  const response = created.response;
  await postIntent<{ ok: boolean }>({
    intent: "register-finish",
    challengeId: start.challengeId,
    id: created.id,
    attestationObject: bytesToB64url(response.attestationObject),
    clientDataJSON: bytesToB64url(response.clientDataJSON),
  });
}

export async function loginWithPasskey(username: string): Promise<void> {
  const start = await postIntent<StartAnswer<LoginOptions>>({
    intent: "login-start",
    ...(username ? { username } : {}),
  });
  const options = start.options;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBytes(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
      allowCredentials: options.allowCredentials?.map((entry) => ({
        type: entry.type,
        id: b64urlToBytes(entry.id),
      })),
    },
  });
  if (!(assertion instanceof PublicKeyCredential)) {
    throw new Error("Your device did not return a passkey. Try again.");
  }
  if (!(assertion.response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("Your device did not return a sign-in. Try again.");
  }
  const response = assertion.response;
  await postIntent<{ ok: boolean }>({
    intent: "login-finish",
    challengeId: start.challengeId,
    id: assertion.id,
    authenticatorData: bytesToB64url(response.authenticatorData),
    clientDataJSON: bytesToB64url(response.clientDataJSON),
    signature: bytesToB64url(response.signature),
    ...(response.userHandle ? { userHandle: bytesToB64url(response.userHandle) } : {}),
  });
}

export async function signOut(): Promise<void> {
  await postIntent<{ ok: boolean }>({ intent: "sign-out" });
}

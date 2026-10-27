// Passkey (WebAuthn) verification with Web Crypto only.
//
// No dependencies: everything here runs on workerd, Bun, and browsers, so
// this example adds nothing to `package.json`. Registration accepts
// attestation format "none" — that is what browsers send when creation
// requests `attestation: "none"` (Face ID, fingerprint, and hardware keys
// all do this) — and signatures verify for ES256 and RS256 credentials.
// Anything else fails with a plain message the sign-in page shows.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64Value(char: string): number {
  return B64URL.indexOf(char);
}

export function b64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64URL[(n >> 18) & 63] ?? "";
    out += B64URL[(n >> 12) & 63] ?? "";
    if (i + 1 < bytes.length) {
      out += B64URL[(n >> 6) & 63] ?? "";
    }
    if (i + 2 < bytes.length) {
      out += B64URL[n & 63] ?? "";
    }
  }
  return out;
}

function malformed(): Error {
  return new Error("That passkey response was malformed. Try again.");
}

export function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw malformed();
  }
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 4) {
    const a = b64Value(value[i] ?? "");
    const b = b64Value(value[i + 1] ?? "");
    const c = i + 2 < value.length ? b64Value(value[i + 2] ?? "") : 0;
    const d = i + 3 < value.length ? b64Value(value[i + 3] ?? "") : 0;
    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw malformed();
    }
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out.push((n >> 16) & 255);
    if (i + 2 < value.length) {
      out.push((n >> 8) & 255);
    }
    if (i + 3 < value.length) {
      out.push(n & 255);
    }
  }
  return new Uint8Array(out);
}

export async function sha256(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const copy: Uint8Array<ArrayBuffer> = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
}

export function randomB64url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// --- Minimal CBOR ---
//
// Only what WebAuthn needs: unsigned and negative integers, byte and text
// strings, arrays, maps, and small constants. Indefinite lengths are
// rejected — authenticators always use definite lengths.

type Cbor = number | boolean | null | string | Uint8Array | Cbor[] | Map<unknown, Cbor>;

function readArgument(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  info: number,
): [number, number] {
  if (info < 24) {
    return [info, offset];
  }
  if (info === 24) {
    return [bytes[offset] ?? 0, offset + 1];
  }
  if (info === 25) {
    return [view.getUint16(offset), offset + 2];
  }
  if (info === 26) {
    return [view.getUint32(offset), offset + 4];
  }
  if (info === 27) {
    const n = view.getUint32(offset) * 2 ** 32 + view.getUint32(offset + 4);
    if (!Number.isSafeInteger(n)) {
      throw malformed();
    }
    return [n, offset + 8];
  }
  throw malformed();
}

function decodeFirst(bytes: Uint8Array, view: DataView, offset: number): [Cbor, number] {
  const head = bytes[offset];
  if (head === undefined) {
    throw malformed();
  }
  const major = head >> 5;
  const info = head & 31;
  if (major === 7) {
    if (info < 20) {
      return [info, offset + 1];
    }
    if (info === 20) {
      return [false, offset + 1];
    }
    if (info === 21) {
      return [true, offset + 1];
    }
    if (info === 22 || info === 23) {
      return [null, offset + 1];
    }
    if (info === 24) {
      const value = bytes[offset + 1];
      if (value === undefined) {
        throw malformed();
      }
      return [value, offset + 2];
    }
    throw malformed();
  }
  const [argument, next] = readArgument(bytes, view, offset + 1, info);
  if (major === 0) {
    return [argument, next];
  }
  if (major === 1) {
    return [-1 - argument, next];
  }
  if (major === 2 || major === 3) {
    const end = next + argument;
    if (!Number.isInteger(argument) || end > bytes.length) {
      throw malformed();
    }
    const slice = bytes.slice(next, end);
    return major === 2 ? [slice, end] : [textDecoder.decode(slice), end];
  }
  if (major === 4) {
    const items: Cbor[] = [];
    let at = next;
    for (let i = 0; i < argument; i++) {
      const [item, after] = decodeFirst(bytes, view, at);
      items.push(item);
      at = after;
    }
    return [items, at];
  }
  if (major === 5) {
    const entries = new Map<unknown, Cbor>();
    let at = next;
    for (let i = 0; i < argument; i++) {
      const [key, afterKey] = decodeFirst(bytes, view, at);
      const [value, afterValue] = decodeFirst(bytes, view, afterKey);
      entries.set(key, value);
      at = afterValue;
    }
    return [entries, at];
  }
  throw malformed();
}

export function decodeCbor(bytes: Uint8Array): Cbor {
  // Copy so the DataView starts at offset zero even for sliced inputs.
  const owned = Uint8Array.from(bytes);
  const view = new DataView(owned.buffer);
  const [value, next] = decodeFirst(owned, view, 0);
  if (next !== owned.length) {
    throw malformed();
  }
  return value;
}

function decodeCborPrefix(bytes: Uint8Array): Cbor {
  const owned = Uint8Array.from(bytes);
  const view = new DataView(owned.buffer);
  return decodeFirst(owned, view, 0)[0];
}

// --- Authenticator data ---

export interface ParsedAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  credentialId: string | null;
  coseKey: Map<unknown, Cbor> | null;
}

export function parseAuthData(authData: Uint8Array): ParsedAuthData {
  if (authData.length < 37) {
    throw malformed();
  }
  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  const flags = view.getUint8(32);
  const signCount = view.getUint32(33);
  let credentialId: string | null = null;
  let coseKey: Map<unknown, Cbor> | null = null;
  if (flags & 0x40) {
    if (authData.length < 55) {
      throw malformed();
    }
    const idLength = view.getUint16(53);
    const idEnd = 55 + idLength;
    if (idLength === 0 || authData.length <= idEnd) {
      throw malformed();
    }
    credentialId = b64urlEncode(authData.slice(55, idEnd));
    const key = decodeCborPrefix(authData.slice(idEnd));
    if (!(key instanceof Map)) {
      throw malformed();
    }
    coseKey = key;
  }
  return { rpIdHash: authData.slice(0, 32), flags, signCount, credentialId, coseKey };
}

// --- COSE public keys ---

const ES256 = -7;
const RS256 = -257;

export interface CoseJwk {
  // The COSE algorithm number, stored next to the key.
  algorithm: number;
  // A Web Crypto JWK, kept as a JSON string for D1.
  publicKey: string;
}

function coseToJwk(cose: Map<unknown, Cbor>): CoseJwk {
  const algorithm = cose.get(3);
  if (algorithm !== ES256 && algorithm !== RS256) {
    throw new Error(
      "Your device made a kind of passkey this app does not support. Try another device.",
    );
  }
  const type = cose.get(1);
  if (type === 2) {
    const curve = cose.get(-1);
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (
      curve !== 1 ||
      !(x instanceof Uint8Array) ||
      !(y instanceof Uint8Array) ||
      x.length !== 32 ||
      y.length !== 32
    ) {
      throw malformed();
    }
    return {
      algorithm,
      publicKey: JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x: b64urlEncode(x),
        y: b64urlEncode(y),
      }),
    };
  }
  if (type === 3) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (
      !(n instanceof Uint8Array) ||
      !(e instanceof Uint8Array) ||
      n.length === 0 ||
      e.length === 0
    ) {
      throw malformed();
    }
    return {
      algorithm,
      publicKey: JSON.stringify({ kty: "RSA", n: b64urlEncode(n), e: b64urlEncode(e) }),
    };
  }
  throw new Error(
    "Your device made a kind of passkey this app does not support. Try another device.",
  );
}

// Reads a DER length prefix at `at`; returns where the content starts and ends.
function derSpan(signature: Uint8Array, at: number): [number, number] {
  const first = signature[at];
  if (first === undefined) {
    throw malformed();
  }
  if (first < 0x80) {
    const end = at + 1 + first;
    if (signature.length < end) {
      throw malformed();
    }
    return [at + 1, end];
  }
  const count = first & 0x7f;
  if (count === 0 || count > 4 || signature.length < at + 1 + count) {
    throw malformed();
  }
  let length = 0;
  for (let i = 0; i < count; i++) {
    length = length * 256 + (signature[at + 1 + i] ?? 0);
  }
  const end = at + 1 + count + length;
  if (signature.length < end) {
    throw malformed();
  }
  return [at + 1 + count, end];
}

// Authenticators sign with DER-encoded ECDSA; Web Crypto wants raw `r || s`.
export function derToRaw(signature: Uint8Array): Uint8Array<ArrayBuffer> {
  if ((signature[0] ?? -1) !== 0x30) {
    throw malformed();
  }
  let pos = derSpan(signature, 1)[0];
  const out = new Uint8Array(64);
  for (let i = 0; i < 2; i++) {
    if ((signature[pos] ?? -1) !== 0x02) {
      throw malformed();
    }
    const [start, end] = derSpan(signature, pos + 1);
    let part = signature.slice(start, end);
    while (part.length > 32 && (part[0] ?? 0) === 0) {
      part = part.slice(1);
    }
    if (part.length === 0 || part.length > 32) {
      throw malformed();
    }
    out.set(part, i * 32 + (32 - part.length));
    pos = end;
  }
  return out;
}

// --- Ceremony verification ---

export interface ExpectedCeremony {
  challenge: string;
  origin: string;
  rpId: string;
}

export interface RegistrationResponse {
  attestationObject: string;
  clientDataJSON: string;
}

export interface VerifiedRegistration extends CoseJwk {
  credentialId: string;
  signCount: number;
}

export interface AuthenticationResponse {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

export interface StoredCredential extends CoseJwk {
  signCount: number;
}

interface ClientData {
  type?: unknown;
  challenge?: unknown;
  origin?: unknown;
}

function decodeClientData(encoded: string): { json: ClientData; bytes: Uint8Array } {
  const bytes = b64urlDecode(encoded);
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw malformed();
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw malformed();
  }
  return {
    json: {
      type: "type" in parsed ? parsed.type : undefined,
      challenge: "challenge" in parsed ? parsed.challenge : undefined,
      origin: "origin" in parsed ? parsed.origin : undefined,
    },
    bytes,
  };
}

function checkCeremony(
  client: ClientData,
  expectedType: string,
  expected: ExpectedCeremony,
  wrongTypeMessage: string,
): void {
  if (client.type !== expectedType) {
    throw new Error(wrongTypeMessage);
  }
  if (client.challenge !== expected.challenge) {
    throw new Error("That passkey challenge expired or was already used. Start again.");
  }
  if (client.origin !== expected.origin) {
    throw new Error("That passkey was made for a different site. Start again.");
  }
}

export async function verifyRegistration(
  response: RegistrationResponse,
  expected: ExpectedCeremony,
): Promise<VerifiedRegistration> {
  const { json: client } = decodeClientData(response.clientDataJSON);
  checkCeremony(
    client,
    "webauthn.create",
    expected,
    "That passkey response was for sign-in, not sign-up. Start again.",
  );
  const attestation = decodeCbor(b64urlDecode(response.attestationObject));
  if (!(attestation instanceof Map)) {
    throw malformed();
  }
  if (attestation.get("fmt") !== "none") {
    throw new Error(
      "Your device added attestation this app does not check. Turn attestation off and try again.",
    );
  }
  const authData = attestation.get("authData");
  if (!(authData instanceof Uint8Array)) {
    throw malformed();
  }
  const parsed = parseAuthData(authData);
  const rpIdHash = await sha256(textEncoder.encode(expected.rpId));
  if (!bytesEqual(parsed.rpIdHash, rpIdHash)) {
    throw new Error("That passkey was made for a different site. Start again.");
  }
  if ((parsed.flags & 1) === 0) {
    throw new Error("No one touched the device to approve that passkey. Try again.");
  }
  if (!parsed.credentialId || !parsed.coseKey) {
    throw new Error("That sign-up did not include a credential. Try again.");
  }
  const { algorithm, publicKey } = coseToJwk(parsed.coseKey);
  return { credentialId: parsed.credentialId, publicKey, algorithm, signCount: parsed.signCount };
}

export async function verifyAuthentication(
  response: AuthenticationResponse,
  expected: ExpectedCeremony,
  credential: StoredCredential,
): Promise<{ signCount: number }> {
  const { json: client, bytes: clientBytes } = decodeClientData(response.clientDataJSON);
  checkCeremony(
    client,
    "webauthn.get",
    expected,
    "That passkey response was for sign-up, not sign-in. Start again.",
  );
  const authData = b64urlDecode(response.authenticatorData);
  if (authData.length < 37) {
    throw malformed();
  }
  const rpIdHash = await sha256(textEncoder.encode(expected.rpId));
  if (!bytesEqual(authData.slice(0, 32), rpIdHash)) {
    throw new Error("That passkey was made for a different site. Start again.");
  }
  if (((authData[32] ?? 0) & 1) === 0) {
    throw new Error("No one touched the device to approve that sign-in. Try again.");
  }
  const clientHash = await sha256(clientBytes);
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData);
  signed.set(clientHash, authData.length);
  const jwk: JsonWebKey = JSON.parse(credential.publicKey);
  let valid = false;
  if (credential.algorithm === ES256) {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      derToRaw(b64urlDecode(response.signature)),
      signed,
    );
  } else if (credential.algorithm === RS256) {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      b64urlDecode(response.signature),
      signed,
    );
  } else {
    throw new Error("That passkey uses an algorithm this app does not support.");
  }
  if (!valid) {
    throw new Error("That passkey signature did not check out. Try again.");
  }
  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  const presented = view.getUint32(33);
  // Synced passkeys rarely count: accept a steady zero, otherwise the count
  // must move forward — a repeated count means a copied credential.
  if (presented > credential.signCount || (presented === 0 && credential.signCount === 0)) {
    return { signCount: presented };
  }
  throw new Error(
    "That passkey looks like a copy of one used elsewhere. Remove it and add a fresh one.",
  );
}

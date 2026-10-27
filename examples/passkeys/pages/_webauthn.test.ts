// Self-test for the passkey crypto: runs a full sign-up and sign-in against
// freshly generated device keys (P-256 and RSA), plus the failure cases the
// server answers with. No browser or D1 needed — everything here is pure.
import { expect, test } from "bun:test";

import {
  b64urlDecode,
  b64urlEncode,
  bytesEqual,
  decodeCbor,
  derToRaw,
  parseAuthData,
  sha256,
  verifyAuthentication,
  verifyRegistration,
} from "./_webauthn.ts";
import { expireSessionCookie, isSecureRequest, readCookie, sessionCookie } from "./_session.ts";

const textEncoder = new TextEncoder();

function need(value: string | undefined): string {
  if (!value) {
    throw new Error("Test key export missed a field.");
  }
  return value;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u16be(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 255, n & 255]);
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function head(major: number, n: number): Uint8Array {
  if (n < 24) {
    return new Uint8Array([(major << 5) | n]);
  }
  if (n < 256) {
    return new Uint8Array([(major << 5) | 24, n]);
  }
  if (n < 65536) {
    return concat(new Uint8Array([(major << 5) | 25]), u16be(n));
  }
  return concat(new Uint8Array([(major << 5) | 26]), u32be(n));
}

function encodeCbor(value: unknown): Uint8Array {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("Test encoder only handles integers.");
    }
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === "string") {
    return concat(head(3, textEncoder.encode(value).length), textEncoder.encode(value));
  }
  if (value instanceof Uint8Array) {
    return concat(head(2, value.length), value);
  }
  if (Array.isArray(value)) {
    return concat(head(4, value.length), ...value.map(encodeCbor));
  }
  if (value instanceof Map) {
    const parts: Uint8Array[] = [head(5, value.size)];
    for (const [key, entry] of value) {
      parts.push(encodeCbor(key), encodeCbor(entry));
    }
    return concat(...parts);
  }
  throw new Error("Test encoder hit an unexpected value.");
}

// ECDSA signatures come out of Web Crypto raw; authenticators send DER.
function rawToDer(signature: Uint8Array): Uint8Array<ArrayBuffer> {
  const halves = [signature.slice(0, 32), signature.slice(32, 64)];
  const parts: Uint8Array[] = [];
  for (const half of halves) {
    let part = half;
    while (part.length > 1 && (part[0] ?? 0) === 0) {
      part = part.slice(1);
    }
    if ((part[0] ?? 0) >= 0x80) {
      const padded = new Uint8Array(part.length + 1);
      padded.set(part, 1);
      part = padded;
    }
    parts.push(part);
  }
  const r = parts[0] ?? new Uint8Array();
  const s = parts[1] ?? new Uint8Array();
  const out = new Uint8Array(2 + 2 + r.length + 2 + s.length);
  out[0] = 0x30;
  out[1] = out.length - 2;
  out[2] = 0x02;
  out[3] = r.length;
  out.set(r, 4);
  out[4 + r.length] = 0x02;
  out[5 + r.length] = s.length;
  out.set(s, 6 + r.length);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

test("base64url round-trips binary of every length", () => {
  for (let n = 0; n <= 64; n++) {
    const bytes = randomBytes(n);
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
  }
  expect(() => b64urlDecode("abcde")).toThrow();
  expect(() => b64urlDecode("***")).toThrow();
});

interface DeviceKey {
  cose: Map<number, Uint8Array | number>;
  algorithm: number;
  sign(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array>;
}

async function p256Key(): Promise<DeviceKey> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const key = pair.privateKey;
  return {
    cose: new Map<number, Uint8Array | number>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, b64urlDecode(need(jwk.x))],
      [-3, b64urlDecode(need(jwk.y))],
    ]),
    algorithm: -7,
    sign: async (data) =>
      rawToDer(
        new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data)),
      ),
  };
}

async function rsaKey(): Promise<DeviceKey> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const key = pair.privateKey;
  return {
    cose: new Map<number, Uint8Array | number>([
      [1, 3],
      [3, -257],
      [-1, b64urlDecode(need(jwk.n))],
      [-2, b64urlDecode(need(jwk.e))],
    ]),
    algorithm: -257,
    sign: async (data) =>
      new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, data)),
  };
}

async function registerDevice(
  device: DeviceKey,
  rpId: string,
  origin: string,
  challenge: string,
): Promise<{ credentialId: string; publicKey: string; algorithm: number; signCount: number }> {
  const credentialId = randomBytes(32);
  const rpIdHash = await sha256(textEncoder.encode(rpId));
  const authData = concat(
    rpIdHash,
    new Uint8Array([0x41]),
    u32be(0),
    new Uint8Array(16),
    u16be(credentialId.length),
    credentialId,
    encodeCbor(device.cose),
  );
  const clientData = JSON.stringify({ type: "webauthn.create", challenge, origin });
  const attestation = encodeCbor(
    new Map<unknown, unknown>([
      ["fmt", "none"],
      ["authData", authData],
      ["attStmt", new Map()],
    ]),
  );
  return verifyRegistration(
    {
      attestationObject: b64urlEncode(attestation),
      clientDataJSON: b64urlEncode(textEncoder.encode(clientData)),
    },
    { challenge, origin, rpId },
  );
}

test("a fresh P-256 passkey registers and then signs in", async () => {
  const rpId = "example.test";
  const origin = "https://example.test";
  const device = await p256Key();
  const registered = await registerDevice(device, rpId, origin, b64urlEncode(randomBytes(32)));
  expect(registered.algorithm).toBe(-7);

  const challenge = b64urlEncode(randomBytes(32));
  const rpIdHash = await sha256(textEncoder.encode(rpId));
  const authData = concat(rpIdHash, new Uint8Array([0x01]), u32be(1));
  const clientData = JSON.stringify({ type: "webauthn.get", challenge, origin });
  const clientBytes = textEncoder.encode(clientData);
  const signed = concat(authData, await sha256(clientBytes));
  const done = await verifyAuthentication(
    {
      authenticatorData: b64urlEncode(authData),
      clientDataJSON: b64urlEncode(clientBytes),
      signature: b64urlEncode(await device.sign(signed)),
    },
    { challenge, origin, rpId },
    {
      publicKey: registered.publicKey,
      algorithm: registered.algorithm,
      signCount: registered.signCount,
    },
  );
  expect(done.signCount).toBe(1);

  // Replaying the same counter looks like a copied passkey.
  await expect(
    verifyAuthentication(
      {
        authenticatorData: b64urlEncode(authData),
        clientDataJSON: b64urlEncode(clientBytes),
        signature: b64urlEncode(await device.sign(signed)),
      },
      { challenge, origin, rpId },
      { publicKey: registered.publicKey, algorithm: registered.algorithm, signCount: 1 },
    ),
  ).rejects.toThrow();
});

test("an RS-256 passkey registers and signs in", async () => {
  const rpId = "example.test";
  const origin = "https://example.test";
  const device = await rsaKey();
  const registered = await registerDevice(device, rpId, origin, b64urlEncode(randomBytes(32)));
  expect(registered.algorithm).toBe(-257);

  const challenge = b64urlEncode(randomBytes(32));
  const rpIdHash = await sha256(textEncoder.encode(rpId));
  const authData = concat(rpIdHash, new Uint8Array([0x01]), u32be(1));
  const clientBytes = textEncoder.encode(
    JSON.stringify({ type: "webauthn.get", challenge, origin }),
  );
  const done = await verifyAuthentication(
    {
      authenticatorData: b64urlEncode(authData),
      clientDataJSON: b64urlEncode(clientBytes),
      signature: b64urlEncode(await device.sign(concat(authData, await sha256(clientBytes)))),
    },
    { challenge, origin, rpId },
    { publicKey: registered.publicKey, algorithm: registered.algorithm, signCount: 0 },
  );
  expect(done.signCount).toBe(1);
});

test("registration rejects the wrong site and wrong challenge", async () => {
  const device = await p256Key();
  const challenge = b64urlEncode(randomBytes(32));
  const credentialId = randomBytes(32);
  const rpIdHash = await sha256(textEncoder.encode("example.test"));
  const authData = concat(
    rpIdHash,
    new Uint8Array([0x41]),
    u32be(0),
    new Uint8Array(16),
    u16be(credentialId.length),
    credentialId,
    encodeCbor(device.cose),
  );
  const clientData = (challengeValue: string, origin: string) =>
    b64urlEncode(
      textEncoder.encode(
        JSON.stringify({ type: "webauthn.create", challenge: challengeValue, origin }),
      ),
    );
  const attestation = b64urlEncode(
    encodeCbor(
      new Map<unknown, unknown>([
        ["fmt", "none"],
        ["authData", authData],
        ["attStmt", new Map()],
      ]),
    ),
  );
  const expected = { challenge, origin: "https://example.test", rpId: "example.test" };
  await expect(
    verifyRegistration(
      { attestationObject: attestation, clientDataJSON: clientData("wrong", expected.origin) },
      expected,
    ),
  ).rejects.toThrow();
  await expect(
    verifyRegistration(
      {
        attestationObject: attestation,
        clientDataJSON: clientData(challenge, "https://evil.test"),
      },
      expected,
    ),
  ).rejects.toThrow();
  const parsed = parseAuthData(authData);
  expect(parsed.credentialId).toBe(b64urlEncode(credentialId));
  expect(bytesEqual(parsed.rpIdHash, rpIdHash)).toBe(true);
});

test("Secure is set everywhere except plain-http loopback", () => {
  expect(sessionCookie("token", true)).toContain("; Secure");
  expect(sessionCookie("token", false)).not.toContain("Secure");
  expect(sessionCookie("token", false)).toContain("HttpOnly");
  expect(sessionCookie("token", false)).toContain("SameSite=Lax");
  expect(expireSessionCookie(true)).toContain("Max-Age=0");
  expect(expireSessionCookie(true)).toContain("; Secure");
  expect(readCookie("theme=dark; session=abc123; other=1", "session")).toBe("abc123");
  expect(readCookie("theme=dark", "session")).toBeNull();
  expect(readCookie(null, "session")).toBeNull();
  expect(isSecureRequest("https://my-app.outer.now/sign-in")).toBe(true);
  expect(isSecureRequest("http://localhost:5173/sign-in")).toBe(false);
  expect(isSecureRequest("http://127.0.0.1:5173/sign-in")).toBe(false);
  expect(isSecureRequest("http://[::1]:5173/sign-in")).toBe(false);
  // Fail closed: plain http anywhere else still gets Secure.
  expect(isSecureRequest("http://my-app.outer.now/sign-in")).toBe(true);
  expect(isSecureRequest("http://203.0.113.7/sign-in")).toBe(true);
});

test("registration rejects a COSE key whose alg mismatches its type", async () => {
  const rpId = "example.test";
  const origin = "https://example.test";
  const challenge = b64urlEncode(randomBytes(32));
  // An EC key claiming RS256: crafted, not from a real authenticator.
  const ecDevice = await p256Key();
  const ecMismatch: DeviceKey = { ...ecDevice, cose: new Map(ecDevice.cose).set(3, -257) };
  await expect(registerDevice(ecMismatch, rpId, origin, challenge)).rejects.toThrow();
  // An RSA key claiming ES256: same story the other way round.
  const rsaDevice = await rsaKey();
  const rsaMismatch: DeviceKey = { ...rsaDevice, cose: new Map(rsaDevice.cose).set(3, -7) };
  await expect(registerDevice(rsaMismatch, rpId, origin, challenge)).rejects.toThrow();
});

test("oversized CBOR input is rejected without decoding it", () => {
  expect(() => decodeCbor(new Uint8Array(8 * 1024 + 1))).toThrow();
});

test("deeply nested CBOR input is rejected fast", () => {
  let value: unknown = 0;
  for (let i = 0; i < 20; i++) {
    value = [value];
  }
  const start = Date.now();
  expect(() => decodeCbor(encodeCbor(value))).toThrow();
  expect(Date.now() - start).toBeLessThan(1000);
});

test("derToRaw consumes every byte and rejects non-minimal integers", () => {
  const r = new Uint8Array(32);
  r[0] = 1;
  const s = new Uint8Array(32);
  s[0] = 2;
  const minimal = rawToDer(concat(r, s));
  expect(derToRaw(minimal)).toHaveLength(64);
  // Trailing garbage after the two INTEGERs.
  expect(() => derToRaw(concat(minimal, new Uint8Array([0])))).toThrow();
  // An unnecessary leading zero on r (next byte needs no sign bit).
  const padded = concat(new Uint8Array([0]), r);
  const nonMinimal = concat(
    new Uint8Array([0x30, 2 + 2 + padded.length + 2 + s.length, 0x02, padded.length]),
    padded,
    new Uint8Array([0x02, s.length]),
    s,
  );
  expect(() => derToRaw(nonMinimal)).toThrow();
});

test("parseAuthData rejects trailing bytes after the COSE key", async () => {
  const device = await p256Key();
  const credentialId = randomBytes(32);
  const rpIdHash = await sha256(textEncoder.encode("example.test"));
  const authData = concat(
    rpIdHash,
    new Uint8Array([0x41]),
    u32be(0),
    new Uint8Array(16),
    u16be(credentialId.length),
    credentialId,
    encodeCbor(device.cose),
  );
  expect(parseAuthData(authData).credentialId).toBe(b64urlEncode(credentialId));
  expect(() => parseAuthData(concat(authData, new Uint8Array([0])))).toThrow();
});

/**
 * HMAC-SHA256 helpers built on Web Crypto (available in the Convex runtime,
 * Node 20+, and edge runtimes).
 *
 * Outbound (Convex -> n8n):  sign(secret, `${ts}.${rawBody}`)
 * Inbound  (n8n -> Convex):  sign(secret, `${ts}.${METHOD}.${path}.${rawBody}`)
 * Header format: `X-LendLoop-Signature: sha256=<hex>`, `X-LendLoop-Timestamp: <unix seconds>`
 */

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Constant-time string comparison (length is not secret: both are 64-char hex). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function outboundMessage(ts: string, rawBody: string): string {
  return `${ts}.${rawBody}`;
}

export function inboundMessage(ts: string, method: string, path: string, rawBody: string): string {
  return `${ts}.${method.toUpperCase()}.${path}.${rawBody}`;
}

export async function signHeader(secret: string, message: string): Promise<string> {
  return `sha256=${await hmacHex(secret, message)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifySignature(opts: {
  secret: string | undefined;
  signatureHeader: string | null;
  timestampHeader: string | null;
  message: (ts: string) => string;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const { secret, signatureHeader, timestampHeader } = opts;
  if (!secret) return { ok: false, reason: "secret not configured" };
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: "missing signature headers" };
  if (!/^\d{1,12}$/.test(timestampHeader)) return { ok: false, reason: "bad timestamp" };
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestampHeader)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale timestamp" };
  }
  const match = /^sha256=([0-9a-f]{64})$/.exec(signatureHeader.trim());
  if (!match) return { ok: false, reason: "malformed signature" };
  const expected = await hmacHex(secret, opts.message(timestampHeader));
  return timingSafeEqual(expected, match[1]) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

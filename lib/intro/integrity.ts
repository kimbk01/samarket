import { createHash } from "node:crypto";

/**
 * Intro packageIntegrity SSOT — ONE canonical contract:
 * SHA-256 of UTF-8 `JSON.stringify(sortKeys(value))` (ECMAScript number/string rules).
 *
 * Platform adapters (Android Java canonicalize, iOS JSCore) must match this byte-for-byte.
 * They are not independent semantic authorities.
 */
export function integrityOfCanonicalJson(value: unknown): string {
  const canonical = canonicalize(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function integrityOfBytes(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Exported for cross-platform fixture parity harnesses. */
export function canonicalizeIntroJson(value: unknown): string {
  return canonicalize(value);
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortKeys(obj[k]);
    }
    return out;
  }
  return value;
}

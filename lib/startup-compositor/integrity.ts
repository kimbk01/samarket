/**
 * REBUILD 14 — integrity contract interface for StartupPackageEnvelope.
 * Reuses canonical JSON SHA-256 from lib/intro/integrity (byte authority).
 */

import {
  canonicalizeIntroJson,
  integrityOfBytes,
  integrityOfCanonicalJson,
} from "@/lib/intro/integrity";

export type StartupIntegrityDigest = {
  readonly algorithm: "sha256";
  readonly hex: string;
};

export function computeEnvelopeIntegrity(
  envelopeWithoutIntegrityField: unknown,
): StartupIntegrityDigest {
  return {
    algorithm: "sha256",
    hex: integrityOfCanonicalJson(envelopeWithoutIntegrityField),
  };
}

export function verifyEnvelopeIntegrity(args: {
  envelopeWithoutIntegrityField: unknown;
  expectedHex: string;
}): boolean {
  const got = computeEnvelopeIntegrity(args.envelopeWithoutIntegrityField);
  return (
    typeof args.expectedHex === "string" &&
    args.expectedHex.length === 64 &&
    got.hex === args.expectedHex.toLowerCase()
  );
}

export function computeMediaIntegrity(
  bytes: Uint8Array | Buffer,
): StartupIntegrityDigest {
  return { algorithm: "sha256", hex: integrityOfBytes(bytes) };
}

export { canonicalizeIntroJson as canonicalizeStartupJson };

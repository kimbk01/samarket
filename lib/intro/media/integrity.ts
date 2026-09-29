import { createHash } from "node:crypto";

export const INTEGRITY_ALGORITHM = "sha256" as const;

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Stored integrity form: `sha256:<hex>` */
export function integrityOf(bytes: Buffer | Uint8Array): string {
  return `${INTEGRITY_ALGORITHM}:${sha256Hex(bytes)}`;
}

export function parseIntegrity(
  value: string,
): { algorithm: string; hex: string } | null {
  const i = value.indexOf(":");
  if (i <= 0) return null;
  const algorithm = value.slice(0, i);
  const hex = value.slice(i + 1);
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  return { algorithm, hex: hex.toLowerCase() };
}

export function integrityMatches(stored: string, bytes: Buffer | Uint8Array): boolean {
  const parsed = parseIntegrity(stored);
  if (!parsed || parsed.algorithm !== INTEGRITY_ALGORITHM) return false;
  return parsed.hex === sha256Hex(bytes);
}

export const PENDING_UPLOAD_INTEGRITY = "PENDING_UPLOAD" as const;

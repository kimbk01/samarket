import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function openingManifestChecksum(input: {
  revisionId: string;
  assetSha256: string[];
}): string {
  const ordered = [...input.assetSha256].sort();
  return sha256Hex(Buffer.from(`${input.revisionId}:${ordered.join(",")}`, "utf8"));
}

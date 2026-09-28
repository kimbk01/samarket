import { createHash } from "node:crypto";
import { canonicalDocumentJson, type DibayIntroDocument } from "@/lib/dibay-intro/document";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function sha256Bytes(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function documentChecksum(document: DibayIntroDocument): string {
  return sha256Hex(canonicalDocumentJson(document));
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_SOURCE_HASH } from "@/lib/dibay-intro/engine/engine-source-hash.generated";
import { ENGINE_FILES, ENGINE_ID, ENGINE_VERSION } from "@/lib/dibay-intro/engine/identity";

/** Disk recompute — available in repo/CI checkout; unavailable on Vercel serverless. */
export function computeEngineSourceHashFromDisk(repoRoot = process.cwd()): string {
  const hash = createHash("sha256");
  hash.update(`${ENGINE_ID}@${ENGINE_VERSION}\n`);
  for (const rel of ENGINE_FILES) {
    hash.update(rel);
    hash.update("\n");
    hash.update(readFileSync(join(repoRoot, rel)));
    hash.update("\n");
  }
  return hash.digest("hex");
}

/**
 * Production Set Live must not `readFileSync` engine TS under `/var/task`.
 * Prefer frozen hash from the bundle script; fall back to disk only when present.
 */
export function computeEngineSourceHash(repoRoot = process.cwd()): string {
  try {
    const fromDisk = computeEngineSourceHashFromDisk(repoRoot);
    if (fromDisk !== ENGINE_SOURCE_HASH) {
      throw new Error(
        `engine_source_hash_stale:disk=${fromDisk}:generated=${ENGINE_SOURCE_HASH}`,
      );
    }
    return fromDisk;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("engine_source_hash_stale:")) throw error;
    if (message.includes("ENOENT") || message.includes("no such file")) {
      return ENGINE_SOURCE_HASH;
    }
    throw error;
  }
}

export { ENGINE_SOURCE_HASH };

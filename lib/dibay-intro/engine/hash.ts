import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_FILES, ENGINE_ID, ENGINE_VERSION } from "@/lib/dibay-intro/engine/identity";

export function computeEngineSourceHash(repoRoot = process.cwd()): string {
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

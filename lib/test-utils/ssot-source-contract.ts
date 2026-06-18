import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SsotSourceContractEntry } from "@/lib/test-utils/ssot-source-contract-registry";

export function readRepoSource(relativePath: string, root = process.cwd()): string {
  return readFileSync(join(root, relativePath), "utf8");
}

export function assertSsotSourceContract(
  entry: SsotSourceContractEntry,
  root = process.cwd()
): void {
  const src = readRepoSource(entry.file, root);
  if (!src.includes(entry.marker)) {
    throw new Error(
      `[ssot-contract] missing marker in ${entry.file}\n  expected: ${entry.marker}`
    );
  }
  for (const fragment of entry.also ?? []) {
    if (!src.includes(fragment)) {
      throw new Error(
        `[ssot-contract] missing fragment in ${entry.file}\n  id: ${entry.id}\n  expected: ${fragment}`
      );
    }
  }
}

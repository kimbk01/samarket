/**
 * DEAD PROVEN 후보: `components/chats/ChatButton.tsx` 정적 import 0.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SCAN_DIRS = ["app", "components", "lib"] as const;
const IMPORT_RE =
  /from\s+["']@\/components\/chats\/ChatButton["']|from\s+["'][^"']*\/chats\/ChatButton["']/;

function walkTsFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".worktrees" || name === ".qa-logs") continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkTsFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (name === "ChatButton.tsx") continue;
    out.push(full);
  }
}

describe("trade ChatButton dead-import scan", () => {
  it("no static import of components/chats/ChatButton outside its own file", () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) {
      walkTsFiles(path.join(ROOT, d), files);
    }
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (IMPORT_RE.test(text)) hits.push(path.relative(ROOT, file));
    }
    expect(hits).toEqual([]);
  });
});

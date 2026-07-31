import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components", "lib", "services"];
const DIRECT_INSERT =
  /\.from\(\s*["']notifications["']\s*\)\s*\.insert\s*\(|insert\s+into\s+(?:public\.)?notifications\b/i;

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "__tests__" || name === "fixtures") continue;
      out.push(...sourceFiles(path));
      continue;
    }
    if (/\.(?:ts|tsx|js|mjs|cjs|sql)$/.test(name)) out.push(path);
  }
  return out;
}

describe("legacy notifications write ban", () => {
  it("keeps product source on notification_events producers", () => {
    const violations = SOURCE_ROOTS.flatMap((dir) =>
      sourceFiles(join(ROOT, dir))
    )
      .filter((path) => DIRECT_INSERT.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));

    expect(violations).toEqual([]);
  });

  it("routes known legacy producers through server/canonical entrypoints", () => {
    expect(readFileSync(join(ROOT, "lib/chat/sendChatMessage.ts"), "utf8")).toContain(
      "return sendMessageViaApi"
    );
    for (const path of [
      "app/api/trade/product-chat/[roomId]/buyer-issue/route.ts",
      "app/api/admin/trade-flow/confirm-buyer/route.ts",
    ]) {
      expect(readFileSync(join(ROOT, path), "utf8"), path).toContain(
        "appendUserNotification"
      );
    }
  });
});

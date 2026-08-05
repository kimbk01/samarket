/**
 * stub-message API — no product runtime callers; terminal unread SSOT is server path.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

describe("call stub-message dead runtime caller contract", () => {
  it("no product importer/caller of /api/.../calls/stub-message outside tests + route", () => {
    const roots = ["app", "components", "lib", "hooks"];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walkTsFiles(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        if (rel.includes("__tests__") || rel.includes(".test.")) continue;
        if (rel === path.join("app", "api", "community-messenger", "calls", "stub-message", "route.ts")) {
          continue;
        }
        const src = fs.readFileSync(file, "utf8");
        if (
          src.includes("/api/community-messenger/calls/stub-message") ||
          src.includes("calls/stub-message")
        ) {
          hits.push(rel);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("server terminal path keeps incrementUnread: true as unread SSOT", () => {
    const service = fs.readFileSync(
      path.join(ROOT, "lib/community-messenger/service.ts"),
      "utf8"
    );
    expect(service).toContain("ensureTerminalCallStub");
    expect(service).toMatch(/incrementUnread:\s*true/);
    expect(service).toContain("resolveTerminalStubActorUserId");
  });

  it("stub-message route documents replaceExisting unread risk (dead path)", () => {
    const route = fs.readFileSync(
      path.join(ROOT, "app/api/community-messenger/calls/stub-message/route.ts"),
      "utf8"
    );
    expect(route).toContain("incrementUnread: !replaceExisting");
    expect(route).toContain("in-flight dialing/incoming stub publish blocked");
  });
});

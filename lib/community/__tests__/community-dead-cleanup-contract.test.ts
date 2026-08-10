import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

function walkTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe("community final dead cleanup contracts", () => {
  it("DEAD_PROVEN paths are gone", () => {
    expect(existsSync(join(root, "tests/e2e/community-slice1-runtime-cases.spec.ts"))).toBe(false);
    expect(existsSync(join(root, "components/write/community/CommunityWriteForm.tsx"))).toBe(false);
    expect(existsSync(join(root, "components/community/CommunityWriteFormClient.tsx"))).toBe(false);
    expect(existsSync(join(root, "components/community-board"))).toBe(false);
    expect(existsSync(join(root, "lib/community-board"))).toBe(false);
    expect(
      existsSync(join(root, "app/api/philife/meetings/[meetingId]/chat-rooms/route.ts")),
    ).toBe(false);
    expect(
      existsSync(join(root, "app/api/philife/meetings/[meetingId]/ensure-main-chat/route.ts")),
    ).toBe(false);
  });

  it("replacement IA runtime harness remains", () => {
    expect(existsSync(join(root, "tests/e2e/community-ia-runtime-cases.spec.ts"))).toBe(true);
  });

  it("no app route imports deleted community-board package", () => {
    const boardPkg = ["@", "/components/community-board"].join("");
    const libPkg = ["@", "/lib/community-board"].join("");
    for (const file of walkTs(join(root, "app"))) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain(boardPkg);
      expect(src, file).not.toContain(libPkg);
    }
  });

  it("community_topics_legacy has no runtime readers after helper removal", () => {
    const needle = '.from("community_topics_legacy")';
    const hits: string[] = [];
    for (const base of ["app", "lib", "components"]) {
      for (const file of walkTs(join(root, base))) {
        if (file.includes("/__tests__/") || file.includes(".test.ts")) continue;
        const src = readFileSync(file, "utf8");
        if (src.includes(needle)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  it("posts/create community branch kept as isolated compat (not deleted)", () => {
    const src = readFileSync(join(root, "app/api/posts/create/route.ts"), "utf8");
    expect(src).toContain('parsed.type === "community"');
    expect(src).toContain("mirrorLegacyCommunityPostToSsot");
  });
});

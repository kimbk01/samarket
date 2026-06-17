import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("block SSOT save contract", () => {
  it("community block-relations uses blockUserSocial / unblockUserSocial", () => {
    const src = read("app/api/community/block-relations/route.ts");
    expect(src).toContain("blockUserSocial");
    expect(src).toContain("unblockUserSocial");
    expect(src).not.toMatch(/user_relationships.*insert\([\s\S]*blocked/);
  });

  it("messenger block route uses same blockUserSocial", () => {
    const src = read("app/api/community-messenger/relations/block/route.ts");
    expect(src).toContain("blockUserSocial");
    expect(src).toContain("unblockUserSocial");
  });

  it("blockUserSocial writes user_social_relations blocked", () => {
    const src = read("lib/community-messenger/social-relations.ts");
    expect(src).toMatch(/from\("user_social_relations"\)[\s\S]*relation_type:\s*"blocked"/);
  });
});

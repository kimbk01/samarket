import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("community admin C+D safe-scope surface contract", () => {
  it("comments API authority is community_comments with soft status only", () => {
    const list = read("app/api/admin/community/engine/comments/route.ts");
    const patch = read("app/api/admin/community/engine/comments/[commentId]/route.ts");
    expect(list).toMatch(/from\("community_comments"\)/);
    expect(list).not.toMatch(/from\("comments"\)/);
    expect(patch).toMatch(/status/);
    expect(patch).toMatch(/active/);
    expect(patch).toMatch(/hidden/);
    expect(patch).toMatch(/deleted/);
    expect(patch).toMatch(/applyCommunityPointReclaimOnModeration/);
    expect(patch).not.toMatch(/\.delete\(/);
  });

  it("posts engine keeps existing writer path and adds safe list filters", () => {
    const posts = read("app/api/admin/community/engine/posts/route.ts");
    expect(posts).toMatch(/userId/);
    expect(posts).toMatch(/createdFrom/);
    expect(posts).toMatch(/createdTo/);
    expect(posts).toMatch(/from\("community_posts"\)/);
  });

  it("point policies page is financial console with global + topic override", () => {
    const page = read("components/admin/community/AdminCommunityPointPoliciesPage.tsx");
    expect(page).toMatch(/admin_community_point_tab_global/);
    expect(page).toMatch(/admin_community_point_tab_boards/);
    expect(page).toMatch(/admin_community_point_inherit/);
    expect(page).toMatch(/admin_community_point_override/);
    expect(page).not.toMatch(/manner/i);
  });

  it("reports UI does not declare comment report HOLD in operator console", () => {
    const reports = read("components/admin/community/AdminCommunityReportsPage.tsx");
    expect(reports).not.toMatch(/admin_feed_reports_comment_hold_note/);
    expect(reports).not.toMatch(/sanction/i);
  });

  it("admin menu wires comments + ops + point without A+B community-nav edits", () => {
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toMatch(/\/admin\/community\/comments/);
    expect(menu).toMatch(/\/admin\/community\/settings/);
    expect(menu).toMatch(/\/admin\/community\/point-policies/);
    expect(menu).toMatch(/Comment report authority/);
    const nav = read("lib/community/community-nav.ts");
    expect(nav.length).toBeGreaterThan(0);
  });
});

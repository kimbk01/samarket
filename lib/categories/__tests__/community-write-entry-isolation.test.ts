import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCanonicalCommunityWriteHref,
  getCategoryWriteHref,
  getUnifiedWriteHref,
  getWriteHref,
} from "@/lib/categories/getCategoryHref";
import type { CategoryWithSettings } from "@/lib/categories/types";

const root = join(process.cwd());

function communityCategory(partial?: Partial<CategoryWithSettings>): CategoryWithSettings {
  return {
    id: "cat-community-1",
    name: "커뮤니티",
    slug: "community",
    icon_key: "community",
    type: "community",
    parent_id: null,
    sort_order: 1,
    is_active: true,
    description: null,
    created_at: "",
    updated_at: "",
    quick_create_enabled: true,
    quick_create_group: null,
    quick_create_order: 0,
    show_in_home_chips: false,
    settings: null,
    ...partial,
  };
}

describe("legacy community create entry isolation", () => {
  it("write href helpers route community to canonical /philife/write", () => {
    const c = communityCategory();
    expect(getCanonicalCommunityWriteHref()).toBe("/philife/write");
    expect(getWriteHref(c)).toBe("/philife/write");
    expect(getUnifiedWriteHref(c)).toBe("/philife/write");
    expect(getCategoryWriteHref(c)).toBe("/philife/write");
  });

  it("WriteSheetFlowInner no longer mounts legacy CommunityWriteForm", () => {
    const src = readFileSync(join(root, "components/write/WriteSheetFlowInner.tsx"), "utf8");
    const legacyFormImport = ["@", "/components/write/community/CommunityWriteForm"].join("");
    expect(src).not.toContain(`from "${legacyFormImport}"`);
    expect(src).toContain("getCanonicalCommunityWriteHref");
    expect(src).toContain('fromList.type === "community"');
    expect(src).toContain('c.type === "community"');
    expect(src).toContain("redirectCommunityWriteToCanonical");
  });

  it("write/[categoryId] redirects community away from legacy form", () => {
    const src = readFileSync(join(root, "app/(main)/write/[categoryId]/page.tsx"), "utf8");
    const legacyFormImport = ["@", "/components/write/community/CommunityWriteForm"].join("");
    expect(src).not.toContain(`from "${legacyFormImport}"`);
    expect(src).toContain("getCanonicalCommunityWriteHref");
    expect(src).toContain('c.type === "community"');
    expect(src).toContain("router.replace(getCanonicalCommunityWriteHref())");
  });

  it("legacy /posts/new and /community/write already converge on canonical writer", () => {
    const postsNew = readFileSync(join(root, "app/(main)/posts/new/page.tsx"), "utf8");
    const communityWrite = readFileSync(join(root, "app/(main)/community/write/page.tsx"), "utf8");
    expect(postsNew).toContain('redirect("/philife/write")');
    expect(communityWrite).toContain('redirect("/philife/write")');
  });

  it("keeps /api/posts/create community branch as bridge (not deleted)", () => {
    const src = readFileSync(join(root, "app/api/posts/create/route.ts"), "utf8");
    expect(src).toContain('parsed.type === "community"');
    expect(src).toContain("mirrorLegacyCommunityPostToSsot");
  });

  it("legacy CommunityWriteForm file is removed (DEAD_PROVEN cleanup)", () => {
    expect(existsSync(join(root, "components/write/community/CommunityWriteForm.tsx"))).toBe(false);
  });
});

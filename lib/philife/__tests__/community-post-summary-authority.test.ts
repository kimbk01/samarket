import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("community post summary authority", () => {
  it("uses one summary helper in every app writer", () => {
    for (const rel of [
      "app/api/community/neighborhood-posts/route.ts",
      "app/api/community/posts/route.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("summarizeCommunityPostContent");
      expect(src).not.toMatch(/function\s+summarize\s*\(/);
    }
  });

  it("sanitizes summary at both feed read boundaries", () => {
    expect(read("lib/neighborhood/queries.ts")).toContain(
      "summarizeCommunityPostContent"
    );
    expect(read("lib/community-feed/queries.ts")).toContain(
      "summarizeCommunityPostContent"
    );
  });

  it("DB trigger and backfill enforce summary from content", () => {
    const sql = read(
      "supabase/migrations/20261025180000_community_post_summary_image_paste_ssot.sql"
    );
    expect(sql).toContain("community_posts_summary_from_content");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF content");
    expect(sql).toContain("UPDATE public.community_posts");
    expect(sql).toContain("/storage/v1/object/public/post-images/");
  });
});

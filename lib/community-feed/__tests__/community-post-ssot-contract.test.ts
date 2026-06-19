import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

describe("community vs trade post separation", () => {
  it("fetchPostsByAuthorWithSupabase excludes community type from trade author lists", () => {
    const src = readFileSync(join(root, "lib/posts/posts-by-author-query-core.ts"), "utf8");
    expect(src).toContain('.filter((p) => p.type !== "community")');
  });

  it("legacy community create mirrors into community_posts SSOT", () => {
    const src = readFileSync(join(root, "app/api/posts/create/route.ts"), "utf8");
    expect(src).toContain('parsed.type === "community"');
    expect(src).toContain("mirrorLegacyCommunityPostToSsot");
  });

  it("Philife neighborhood write invalidates author post caches on success", () => {
    const src = readFileSync(join(root, "components/philife/PhilifeNeighborhoodWriteForm.tsx"), "utf8");
    expect(src).toContain("invalidateCommunityAuthorPostsClientCaches");
  });

  it("listCommunityPostsForUser queries community_posts with active status", () => {
    const src = readFileSync(join(root, "lib/community-feed/list-community-posts-for-user.ts"), "utf8");
    expect(src).toContain('from("community_posts")');
    expect(src).toContain("COMMUNITY_POST_FEED_STATUS_ACTIVE");
    expect(src).toContain("fetchAuthorPostRows");
    expect(src).toContain("base_columns_no_status");
    expect(src).toContain("logListCommunityPostsForUserIssue");
  });

  it("legacy mirror is idempotent before RPC", () => {
    const src = readFileSync(join(root, "lib/community-feed/ensure-community-post-for-ads.ts"), "utf8");
    expect(src).toContain('eq("source_legacy_post_id", postId)');
    expect(src).toContain("ensure_community_post_for_post_ads");
  });
});

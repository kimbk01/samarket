import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("community P1 divergence contracts", () => {
  it("member PATCH exists on neighborhood-posts with ownership + imported deny", () => {
    const route = read("app/api/community/neighborhood-posts/[postId]/route.ts");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("auth.userId");
    expect(route).toContain("isCommunityImportedOrigin");
    expect(route).toMatch(/user_id\s*!==\s*auth\.userId|r\.user_id !== auth\.userId/);
    const philife = read("app/api/philife/neighborhood-posts/[postId]/route.ts");
    expect(philife).toContain("PATCH");
  });

  it("comment/reply report uses community_reports not legacy /api/reports", () => {
    const reports = read("app/api/community/reports/route.ts");
    expect(reports).toContain('rawType === "comment"');
    expect(reports).toContain('targetType = "comment"');
    expect(reports).toContain("community_reports");
    expect(reports).toContain("신고만으로 auto-hide 하지 않음");
    expect(reports).not.toMatch(/\.update\(\s*\{[^}]*is_hidden\s*:\s*true/);
    const client = read("lib/reports/createCommunityFeedCommentReport.ts");
    expect(client).toContain("/api/community/reports");
    expect(client).not.toMatch(/fetch\(["']\/api\/reports["']/);
    expect(client).toContain("레거시 /api/reports 금지");
    const detail = read("components/community/CommunityDetail.tsx");
    expect(detail).toContain("createCommunityFeedCommentReport");
    expect(detail).not.toContain("createCommunityCommentReport(");
  });

  it("admin comment delete uses engine comments path when asAdmin", () => {
    const hook = read("hooks/use-philife-post-comments.ts");
    expect(hook).toContain("asAdmin");
    expect(hook).toContain("/api/admin/community/engine/comments/");
    const item = read("components/community/post-detail/CommunityCommentItem.tsx");
    expect(item).toContain("asAdmin: viewerIsAdmin && !isOwner");
  });

  it("feed cache invalidate wired on member delete and admin hide/deleted", () => {
    const detail = read("components/community/CommunityDetail.tsx");
    expect(detail).toContain("invalidateCommunityFeedCachesAfterPostModeration");
    const adminList = read("components/admin/community/AdminCommunityEnginePostsClient.tsx");
    expect(adminList).toContain("invalidateCommunityFeedCachesAfterPostModeration");
    const adminDetail = read("components/admin/community/AdminCommunityPostDetailPage.tsx");
    expect(adminDetail).toContain("invalidateCommunityFeedCachesAfterPostModeration");
  });

  it("detail fade-in is opacity-only under community-ui with reduced-motion", () => {
    const css = read("lib/community/community-design-tokens.css");
    expect(css).toContain("community-post-detail-fade-in");
    expect(css).toContain("opacity");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*community-post-detail-fade-in/);
    const detail = read("components/community/CommunityDetail.tsx");
    expect(detail).toContain("community-post-detail-fade-in");
    expect(detail).not.toContain("CommunityPostDetailClient");
  });

  it("write edit mode reuses form via PATCH not a second writer", () => {
    const form = read("components/philife/PhilifeNeighborhoodWriteForm.tsx");
    expect(form).toContain("editPostId");
    expect(form).toContain('method: "PATCH"');
    expect(form).toContain("philifeNeighborhoodPostUrl");
    const page = read("app/(main)/philife/write/page.tsx");
    expect(page).toContain("editPostId");
    expect(page).toContain("isCommunityImportedOrigin");
  });
});

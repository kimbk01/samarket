import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("community dead/legacy cleanup contracts", () => {
  it("SAFE_DELETE dead components are removed", () => {
    expect(existsSync(join(root, "components/community/CommunityPostDetailClient.tsx"))).toBe(false);
    expect(existsSync(join(root, "components/community/CommunityComposeSheet.tsx"))).toBe(false);
    expect(existsSync(join(root, "components/admin/community/AdminCommunityEnginePostsClient.tsx"))).toBe(
      false
    );
    expect(existsSync(join(root, "components/admin/community/AdminCommunityEnginePageClient.tsx"))).toBe(
      false
    );
    expect(existsSync(join(root, "components/admin/community/AdminCommunityTable.tsx"))).toBe(false);
  });

  it("canonical detail/write/admin posts remain mounted", () => {
    const detailPage = read("app/(main)/philife/[postId]/page.tsx");
    expect(detailPage).toMatch(/Detail|CommunityDetail/);
    const detail = read("components/community/CommunityDetail.tsx");
    expect(detail).toContain("CommunityPostDetailHeader");
    expect(detail).not.toContain("CommunityPostDetailClient");

    const write = read("components/philife/PhilifeNeighborhoodWriteForm.tsx");
    expect(write).toContain("philifeNeighborhoodPostsUrl");

    const adminPosts = read("app/admin/community/posts/page.tsx");
    expect(adminPosts).toContain("AdminPostsPageContent");
  });

  it("Philife reports stay on community_reports; Trade /api/reports remains separate", () => {
    const feedPost = read("lib/reports/createCommunityFeedPostReport.ts");
    const feedComment = read("lib/reports/createCommunityFeedCommentReport.ts");
    expect(feedPost).toContain("/api/community/reports");
    expect(feedComment).toContain("/api/community/reports");
    expect(feedComment).not.toMatch(/fetch\(["']\/api\/reports["']/);

    const tradeComment = read("lib/reports/createCommunityCommentReport.ts");
    expect(tradeComment).toContain('/api/reports');

    const tradeRoute = read("app/api/reports/route.ts");
    expect(tradeRoute).toMatch(/reports/);
  });

  it("navigation authority and legacy create route remain classified", () => {
    const nav = read("lib/community/community-post-entry-nav.ts");
    expect(nav).toContain("resolveCommunityDetailBackHref");
    expect(existsSync(join(root, "app/api/community/posts/route.ts"))).toBe(true);
    const legacyCreate = read("app/api/community/posts/route.ts");
    expect(legacyCreate).toContain("export async function POST");
    const communityHome = read("app/(main)/community/page.tsx");
    expect(communityHome).toContain("CommunityHomeSurface");
  });
});

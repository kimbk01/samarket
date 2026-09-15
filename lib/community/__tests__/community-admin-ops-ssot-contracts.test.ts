import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminCommunityCommentModerationHref,
  adminCommunityPostModerationHref,
  resolveCommunityCommentRowKind,
  resolveCommunityReportDisplayTarget,
} from "@/lib/community-feed/community-report-display-target";

const root = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("community admin operations SSOT contracts", () => {
  it("display target resolves post / comment / reply from target_type + parent_id", () => {
    expect(resolveCommunityReportDisplayTarget({ targetType: "post" })).toBe("post");
    expect(resolveCommunityReportDisplayTarget({ targetType: "comment", parentId: null })).toBe("comment");
    expect(resolveCommunityReportDisplayTarget({ targetType: "comment", parentId: "" })).toBe("comment");
    expect(
      resolveCommunityReportDisplayTarget({ targetType: "comment", parentId: "parent-uuid" })
    ).toBe("reply");
    expect(resolveCommunityCommentRowKind(null)).toBe("comment");
    expect(resolveCommunityCommentRowKind("p1")).toBe("reply");
  });

  it("moderation hrefs target existing Admin surfaces", () => {
    expect(adminCommunityPostModerationHref("post-1")).toBe("/admin/community/posts/post-1");
    expect(adminCommunityCommentModerationHref({ commentId: "c1", postId: "p1" })).toBe(
      "/admin/community/comments?commentId=c1&postId=p1"
    );
  });

  it("report PATCH audit actor_id comes from authenticated Admin, not client", () => {
    const src = read("app/api/admin/community-reports/[id]/route.ts");
    expect(src).toContain("requireAdminApiUser");
    expect(src).toContain("actor_id: admin.userId");
    expect(src).not.toMatch(/actor_id:\s*null/);
    expect(src).not.toMatch(/body\.actor/);
    expect(src).toContain("applyCommunityPointReclaimFromReportTarget");
    expect(src).not.toMatch(/status:\s*[\"']hidden[\"']/);
  });

  it("admin comments engine select includes parent_id and operational filters", () => {
    const src = read("app/api/admin/community/engine/comments/route.ts");
    expect(src).toContain("parent_id");
    expect(src).toContain('sp.get("commentId")');
    expect(src).toContain('sp.get("type")');
    expect(src).toContain('sp.get("reported")');
    expect(src).toContain("report_count");
    expect(src).toContain('eq("target_type", "comment")');
    expect(src).toContain("resolveCommunityCommentRowKind");
  });

  it("admin comments UI renders type badge and reported/type/commentId filters", () => {
    const src = read("components/admin/community/AdminCommunityCommentsPage.tsx");
    expect(src).toContain("admin_community_target_type_reply");
    expect(src).toContain("admin_community_target_type_comment");
    expect(src).toContain('searchParams.get("commentId")');
    expect(src).toContain('searchParams.get("type")');
    expect(src).toContain('searchParams.get("reported")');
    expect(src).toContain("report_count");
    expect(src).toContain("/api/admin/community/engine/comments/");
  });

  it("report list/detail do not hardcode comment targets as post", () => {
    const list = read("components/admin/community/AdminCommunityReportsPage.tsx");
    const detail = read("components/admin/community/AdminCommunityReportDetailClient.tsx");
    expect(list).toContain("display_target");
    expect(list).toContain("admin_community_target_type_comment");
    expect(list).toContain("admin_community_target_type_reply");
    expect(list).toContain("moderation_href");
    expect(detail).toContain("admin_community_report_moderate_target");
    expect(detail).toContain("display_target");
    expect(detail).toContain("admin_community_target_type_comment");
    expect(detail).toContain("admin_community_target_type_reply");
    expect(detail).toContain("targetTypeLabel");
  });

  it("report author filter includes comment authors (target author semantics)", () => {
    const src = read("lib/community-feed/admin-community-reports.ts");
    expect(src).toContain('from("community_comments")');
    expect(src).toContain(".eq(\"user_id\", author)");
    expect(src).toContain("select(\"id, post_id, user_id, content, parent_id\")");
    expect(src).toContain("display_target");
    expect(src).toContain("moderation_href");
  });

  it("public community_reports SSOT and no-auto-hide remain", () => {
    const reports = read("app/api/community/reports/route.ts");
    expect(reports).toContain("community_reports");
    const detail = read("components/admin/community/AdminCommunityReportDetailClient.tsx");
    expect(detail).toMatch(/신고 상태|Resolving a report/);
  });
});

/**
 * ARO-OPS-UX-001-W3 — Community domain migration contract tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import {
  ARO_IA_001_COMMUNITY_SECTION_KEYS,
  ARO_IA_001_OWNERS,
} from "@/lib/admin/aro-ia-001-community-common-links";
import {
  COMMUNITY_COMMENT_ENTITY_ACTION_POLICY,
  COMMUNITY_POST_ENTITY_ACTION_POLICY,
  getOperationalFrequencyEntry,
  isBulkActionAllowed,
  listOperationalFrequencyByWorkspace,
  listVisibleBulkActions,
  selectionHeaderState,
  terminologyDisplay,
} from "@/lib/admin/management";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("ARO-OPS-UX-001-W3 community domain migration", () => {
  it("C1 sidebar frequency/order: moderation before content", () => {
    const community = findAdminMenuByKey(adminMenu, "community");
    expect(community?.children?.map((c) => c.key)).toEqual([...ARO_IA_001_COMMUNITY_SECTION_KEYS]);
    expect(ARO_IA_001_COMMUNITY_SECTION_KEYS.indexOf("community-section-moderation")).toBeLessThan(
      ARO_IA_001_COMMUNITY_SECTION_KEYS.indexOf("community-section-content")
    );
    const byFreq = listOperationalFrequencyByWorkspace("COMMUNITY");
    expect(byFreq[0]?.frequency).toBe("DAILY_CRITICAL");
    expect(getOperationalFrequencyEntry("community-reports")?.frequency).toBe("DAILY_CRITICAL");
    expect(getOperationalFrequencyEntry("community-posts")?.frequency).toBe("FREQUENT");
    expect(getOperationalFrequencyEntry("community-promotions")?.frequency).toBe("OCCASIONAL");
    expect(getOperationalFrequencyEntry("community-point-policies")?.frequency).toBe(
      "CONFIGURATION"
    );
    expect(getOperationalFrequencyEntry("community-settings")?.frequency).toBe("CONFIGURATION");
  });

  it("C2 terminology SSOT keeps report ≠ support and promotion ≠ ad", () => {
    expect(terminologyDisplay("POST", "ko")).toMatch(/게시/);
    expect(terminologyDisplay("COMMENT", "ko")).toMatch(/댓글/);
    expect(terminologyDisplay("REPORT", "ko")).toMatch(/신고/);
    expect(terminologyDisplay("MEETING_REPORT", "ko")).toMatch(/모임/);
    expect(terminologyDisplay("PROMOTION", "ko")).toMatch(/홍보/);
    expect(terminologyDisplay("ADVERTISEMENT", "ko")).toMatch(/광고/);
    expect(terminologyDisplay("SUPPORT_CASE", "ko")).toMatch(/고객지원|지원|케이스|Case/i);
    expect(terminologyDisplay("HIDE", "ko")).toBe("숨김");
    expect(terminologyDisplay("RESTORE", "ko")).toBe("복구");
    expect(terminologyDisplay("SOFT_DELETE", "ko")).toBe("삭제(상태)");
    expect(terminologyDisplay("HARD_DELETE", "ko")).toBe("DB 영구 삭제");
    expect(terminologyDisplay("DELETE", "ko")).toBe("삭제");
  });

  it("C3–C7 posts use W1 contract + selection + policy-correct bulk/hard-delete", () => {
    const posts = read("app/admin/community/posts/AdminPostsPageContent.tsx");
    expect(posts).toContain("AdminManagementSurfaceRoot");
    expect(posts).toContain('wave="w3"');
    expect(posts).toContain("AdminManagementTableViewport");
    expect(posts).toContain("useAdminManagementSelection");
    expect(posts).toContain("AdminManagementSelectionCheckbox");
    expect(posts).toContain("AdminManagementBulkBar");
    expect(posts).toContain("COMMUNITY_POST_ENTITY_ACTION_POLICY");
    expect(posts).toContain("/api/admin/community/engine/posts/bulk-delete");
    expect(posts).not.toContain("admin_community_danger_zone");
    expect(posts).not.toContain("min-w-[1100px]");
    expect(posts).toMatch(/현재 페이지|current page/);
    expect(selectionHeaderState(new Set(["a"]), ["a", "b"])).toBe("some");
    expect(COMMUNITY_POST_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(true);
    expect(isBulkActionAllowed(COMMUNITY_POST_ENTITY_ACTION_POLICY, "hard_delete")).toBe(true);
    expect(isBulkActionAllowed(COMMUNITY_POST_ENTITY_ACTION_POLICY, "hide")).toBe(true);
    expect(listVisibleBulkActions(COMMUNITY_POST_ENTITY_ACTION_POLICY)).toEqual([
      "hide",
      "restore",
      "soft_delete",
      "hard_delete",
    ]);
  });

  it("C8 comments management contract + soft-only delete", () => {
    const comments = read("components/admin/community/AdminCommunityCommentsPage.tsx");
    expect(comments).toContain('wave="w3"');
    expect(comments).toContain("useAdminManagementSelection");
    expect(comments).toContain("AdminManagementBulkBar");
    expect(comments).toContain("COMMUNITY_COMMENT_ENTITY_ACTION_POLICY");
    expect(comments).not.toContain("min-w-[1100px]");
    expect(comments).not.toContain("bulk-delete");
    expect(COMMUNITY_COMMENT_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(false);
    expect(isBulkActionAllowed(COMMUNITY_COMMENT_ENTITY_ACTION_POLICY, "hard_delete")).toBe(false);
    expect(COMMUNITY_COMMENT_ENTITY_ACTION_POLICY.deleteMode).toBe("SOFT_DELETE");
  });

  it("C9–C11 community_reports separate owner + state-based CTA", () => {
    const reports = read("components/admin/community/AdminCommunityReportsPage.tsx");
    expect(reports).toContain("data-admin-community-reports-owner={ARO_IA_001_OWNERS.report}");
    expect(reports).toContain("ARO_IA_001_OWNERS.report");
    expect(ARO_IA_001_OWNERS.report).toBe("community_reports");
    expect(reports).toContain("nextReportActions");
    expect(reports).toContain("community-report-to-support");
    expect(reports).toContain("AdminManagementTableViewport");
    expect(reports).not.toContain("min-w-[1000px]");
    expect(reports).not.toContain("/api/admin/philife/meeting-reports");
    expect(reports).toContain("/api/admin/community-reports/");
  });

  it("C10 meeting_reports separate owner preserved", () => {
    const meeting = read("components/admin/philife/AdminMeetingReportsPage.tsx");
    expect(meeting).toContain("data-admin-meeting-reports-owner={ARO_IA_001_OWNERS.meetingReport}");
    expect(ARO_IA_001_OWNERS.meetingReport).toBe("meeting_reports");
    expect(meeting).toContain("/api/admin/philife/meeting-reports/");
    expect(meeting).not.toContain("community_reports");
    expect(meeting).toContain("data-admin-report-cta-state");
  });

  it("C12–C13 promotion + point policy owners/cross-links preserved", () => {
    const promo = read("components/admin/ads/AdminAdApplicationsPage.tsx");
    expect(promo).toContain(`data-admin-writer="${ARO_IA_001_OWNERS.promotion}"`);
    expect(promo).toContain("community-promo-to-ads");
    expect(promo).toContain('data-aro-ops-ux-001-w3="1"');
    const point = read("components/admin/community/AdminCommunityPointPoliciesPage.tsx");
    expect(point).toContain("community-point-to-finance");
    expect(point).toContain('data-admin-writer="board_point_policies"');
    expect(point).toContain("/api/admin/point-policies/board");
  });

  it("C14–C16 member links + loading states + mutation owners", () => {
    const posts = read("app/admin/community/posts/AdminPostsPageContent.tsx");
    expect(posts).toContain("/admin/users/");
    expect(posts).toContain('data-admin-mgmt-state="EMPTY"');
    expect(posts).toContain('data-admin-mgmt-state="ERROR"');
    expect(posts).toContain("/api/admin/community/engine/posts");
    const comments = read("components/admin/community/AdminCommunityCommentsPage.tsx");
    expect(comments).toContain("/admin/users/");
    expect(comments).toContain("/api/admin/community/engine/comments");
    const reports = read("components/admin/community/AdminCommunityReportsPage.tsx");
    expect(reports).toContain("/api/admin/community-reports/");
  });

  it("C17–C20 tablet geometry: no fixed 1100/1000 min-width; viewport owner present", () => {
    expect(read("app/admin/community/posts/AdminPostsPageContent.tsx")).toContain(
      "AdminManagementTableViewport"
    );
    expect(read("components/admin/community/AdminCommunityCommentsPage.tsx")).toContain(
      "AdminManagementTableViewport"
    );
    expect(read("components/admin/community/AdminCommunityReportsPage.tsx")).toContain(
      "AdminManagementTableViewport"
    );
    expect(read("components/admin/philife/AdminMeetingReportsPage.tsx")).toContain(
      'proofSurface="meeting-reports"'
    );
    expect(read("components/admin/management/AdminManagementTableViewport.tsx")).toContain(
      "data-admin-mgmt-table-viewport"
    );
  });
});

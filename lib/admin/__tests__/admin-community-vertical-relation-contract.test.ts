import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 3 — COMMUNITY vertical relation/presentation (no new writers / correlation / badge).
 */
describe("Admin Community vertical relation contract", () => {
  it("Community promotions page is a community-scoped screen (설계 v2 §C-12) with a link to all boosts", () => {
    // 승인 절차 없음 — 노출 중지/재개/종료만. 거래 포함 전체 상위노출은 링크로 유지.
    const page = read("app/admin/community/promotions/page.tsx");
    expect(page).not.toContain("redirect(");
    expect(page).toContain("AdminCommunityPromotionsPage");
    expect(page).toContain("/admin/advertising/boosts");
    expect(page).not.toContain("AdminAdApplicationsPage");
    const screen = read("components/admin/community/promotions/AdminCommunityPromotionsPage.tsx");
    expect(screen).toContain("/admin/advertising/boosts");
    expect(screen).not.toContain('"approve"');
  });

  it("Post detail links comments, reports, and promotions", () => {
    const detail = read("components/admin/community/AdminCommunityPostDetailPage.tsx");
    expect(detail).toContain("/admin/community/comments?postId=");
    expect(detail).toContain("/admin/community/reports?targetId=");
    expect(detail).toContain("/admin/community/promotions");
  });

  it("Promotion queue links Admin community post", () => {
    const queue = read("components/admin/ads/AdminCommunityPromotionQueue.tsx");
    expect(queue).toContain("/admin/community/posts/");
    expect(queue).toContain("admin_comm_promo_open_admin_post");
  });

  it("Report decision panel: decision endpoint for upheld/dismissed, memo separate, no developer jargon", () => {
    // 설계 v2 §C-2·C-3·E-5: 신고 인정/기각 + 조치는 decision 한 요청, 메모는 adminMemo 만 (C-10)
    const detail = read("components/admin/community/AdminCommunityReportDetailClient.tsx");
    expect(detail).toContain("CommunityReportDecisionPanel");
    const panel = read("components/admin/community/reports/CommunityReportDecisionPanel.tsx");
    expect(panel).toContain("/decision`");
    expect(panel).toContain('decision: "resolved"');
    expect(panel).toContain('decision: "dismissed"');
    expect(panel).toContain("adminMemo:");
    expect(panel).toContain("expectedStatus: status");
    expect(panel).toContain("/admin/users/");
    // PATCH 로 인정/기각 상태를 직접 보내지 않는다
    expect(panel).not.toMatch(/status:\s*["'](resolved|dismissed)["']/);
    expect(panel).not.toMatch(/\bMCC\b|writer/);
  });

  it("does not invent COMMUNITY_PROMO_PENDING durable consumer", () => {
    const aq = read("lib/admin/admin-action-queue.ts");
    expect(aq).not.toMatch(/community_promo_pending/);
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).not.toContain("communityPromo");
  });
});

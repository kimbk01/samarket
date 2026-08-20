import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 3 — COMMUNITY vertical relation/presentation (no new writers / correlation / badge).
 */
describe("Admin Community vertical relation contract", () => {
  it("Community promotions page renders queue in-place (not redirect-only)", () => {
    const page = read("app/admin/community/promotions/page.tsx");
    expect(page).toContain("AdminAdApplicationsPage");
    expect(page).toContain('forcedDomain="community"');
    expect(page).not.toMatch(/redirect\(/);
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

  it("Report detail separates resolve from content hide and MCC", () => {
    const report = read("components/admin/community/AdminCommunityReportDetailClient.tsx");
    expect(report).toContain("admin_community_report_separate_actions");
    expect(report).toContain("admin_community_report_open_content_moderation");
    expect(report).toContain("admin_report_open_mcc_sanction");
    expect(report).toContain("/admin/community/posts/");
    expect(report).toContain("/admin/users/");
    // Must not invent hide inside report PATCH body
    expect(report).toMatch(
      /body:\s*JSON\.stringify\(\{\s*status,\s*admin_memo:/
    );
    expect(report).not.toMatch(/JSON\.stringify\(\{[^}]*\bhide\b/);
  });

  it("does not invent COMMUNITY_PROMO_PENDING durable consumer", () => {
    const aq = read("lib/admin/admin-action-queue.ts");
    expect(aq).not.toMatch(/community_promo_pending/);
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).not.toContain("communityPromo");
  });
});

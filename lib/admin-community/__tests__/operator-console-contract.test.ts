import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("admin community operator console contract", () => {
  it("posts list route enriches author_label", () => {
    const posts = read("app/api/admin/community/engine/posts/route.ts");
    expect(posts).toMatch(/author_label/);
    expect(posts).toMatch(/formatAdminMemberLabel/);
    expect(posts).toMatch(/report_count/);
    expect(posts).toMatch(/period/);
  });

  it("community-reports PATCH has no sanctions writer", () => {
    const patch = read("app/api/admin/community-reports/[id]/route.ts");
    expect(patch).toMatch(/admin_memo/);
    expect(patch).toMatch(/status/);
    expect(patch).not.toMatch(/sanction/i);
    expect(patch).not.toMatch(/banUser/i);
    expect(patch).not.toMatch(/createSanction/i);
  });

  it("comments route uses collectCommunityPostIdsForTopicSlug and has no report CTA writer", () => {
    const list = read("app/api/admin/community/engine/comments/route.ts");
    expect(list).toMatch(/collectCommunityPostIdsForTopicSlug/);
    expect(list).toMatch(/author_label/);
    expect(list).toMatch(/topicFilterTruncated/);
    expect(list).not.toMatch(/createReport/i);
    expect(list).not.toMatch(/community_reports/);

    const ui = read("components/admin/community/AdminCommunityCommentsPage.tsx");
    expect(ui).not.toMatch(/admin\/community\/reports/);
    expect(ui).not.toMatch(/report_count/);
    expect(ui).toMatch(/admin_community_topic_filter_truncated/);
  });

  it("AdminCommunityReportsPage does not call sanctions", () => {
    const reports = read("components/admin/community/AdminCommunityReportsPage.tsx");
    expect(reports).not.toMatch(/sanction/i);
    expect(reports).toMatch(/\/api\/admin\/community-reports\//);
    expect(reports).toMatch(/admin_feed_reports_col_reporter/);
    expect(reports).toMatch(/admin_community_target_type_post/);
  });

  it("menu label keys exist for community categories", () => {
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toMatch(/admin_menu_community_topics/);
    expect(menu).toMatch(/admin_menu_community_posts/);
    expect(menu).toMatch(/admin_menu_community_comments/);
    expect(menu).toMatch(/admin_menu_community_reports/);

    const catalog = read("lib/i18n/catalog/admin.ts");
    expect(catalog).toMatch(/admin_menu_community_topics:/);
    expect(catalog).toMatch(/admin_menu_community_posts:/);
    expect(catalog).toMatch(/admin_menu_community_comments:/);
    expect(catalog).toMatch(/admin_menu_community_reports:/);
  });

  it("home summary module exists", () => {
    const summary = read("lib/admin-community/home-summary.ts");
    expect(summary).toMatch(/loadAdminCommunityHomeSummary/);
    expect(summary).toMatch(/todayPosts/);
    expect(summary).toMatch(/pendingReports/);

    const home = read("components/admin/community/AdminCommunityHomePage.tsx");
    expect(home).toMatch(/AdminCommunityHomeSummary/);
    expect(home).toMatch(/admin_community_home_today_posts/);
  });

  it("admin post detail route and danger zone keys are wired", () => {
    const detailPage = read("app/admin/community/posts/[postId]/page.tsx");
    expect(detailPage).toMatch(/AdminCommunityPostDetailPage/);
    const detail = read("components/admin/community/AdminCommunityPostDetailPage.tsx");
    expect(detail).toMatch(/\/api\/admin\/community\/engine\/posts\//);
    expect(detail).toMatch(/admin_community_system_info/);
    expect(detail).toMatch(/admin_community_view_on_site/);

    const postsUi = read("app/admin/community/posts/AdminPostsPageContent.tsx");
    expect(postsUi).toMatch(/admin_community_danger_zone/);
    expect(postsUi).toMatch(/author_label/);
    expect(postsUi).toMatch(/\/admin\/community\/posts\//);
  });
});

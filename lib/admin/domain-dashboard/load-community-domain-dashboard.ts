/**
 * Community Domain Dashboard — expand home summary (read-only).
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  communityAdminStartOfTodayIso,
  loadAdminCommunityHomeSummary,
} from "@/lib/admin-community/home-summary";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import {
  ARO_IA_001_ADS_HUB_PATH,
  ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH,
  ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
  ARO_IA_001_COMMUNITY_REPORTS_PATH,
  ARO_IA_001_MEETING_REPORTS_PATH,
  ARO_IA_001_SUPPORT_PATH,
} from "@/lib/admin/aro-ia-001-community-common-links";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";

export async function loadCommunityDomainDashboard(): Promise<AdminDomainDashboardModel> {
  const sectionErrors: string[] = [];
  const sb = getSupabaseServer();

  let summary = null as Awaited<ReturnType<typeof loadAdminCommunityHomeSummary>> | null;
  try {
    summary = await loadAdminCommunityHomeSummary();
    if (!summary) sectionErrors.push("community_home_summary:unavailable");
  } catch (e) {
    sectionErrors.push(`community_home_summary:${e instanceof Error ? e.message : "error"}`);
  }

  let queue = null as Awaited<ReturnType<typeof loadAdminActionQueueCounts>> | null;
  try {
    queue = await loadAdminActionQueueCounts({ storesSb: sb as any, notesSb: sb as any });
  } catch (e) {
    sectionErrors.push(`action_queue:${e instanceof Error ? e.message : "error"}`);
  }
  const unavailable = new Set(queue?.unavailable ?? []);

  const [postsTotal, commentsTotal, deletedPosts] = await Promise.all([
    adminDomainCountExact(() =>
      (sb as any).from("community_posts").select("id", { count: "exact", head: true })
    ),
    adminDomainCountExact(() =>
      (sb as any).from("community_comments").select("id", { count: "exact", head: true })
    ),
    adminDomainCountExact(() =>
      (sb as any).from("community_posts").select("id", { count: "exact", head: true }).eq("status", "deleted")
    ),
  ]);

  const recent: AdminDomainDashboardModel["recent"] = [];
  try {
    const since = communityAdminStartOfTodayIso();
    const { data, error } = await (sb as any)
      .from("community_posts")
      .select("id, title, status, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) sectionErrors.push(`community_recent:${error.message}`);
    else {
      for (const row of data ?? []) {
        recent.push({
          id: String(row.id),
          title: String(row.title ?? row.id),
          metaKo: `상태 ${String(row.status ?? "—")}`,
          metaEn: `status ${String(row.status ?? "—")}`,
          href: `/admin/community/posts`,
          at: row.created_at ? String(row.created_at) : null,
        });
      }
    }
  } catch (e) {
    sectionErrors.push(`community_recent:${e instanceof Error ? e.message : "error"}`);
  }

  const actionRequired = [
    {
      id: "community_reports",
      labelKo: "일반 신고 검토",
      labelEn: "General report review",
      count: unavailable.has("community_reports")
        ? null
        : (queue?.community_reports ?? summary?.pendingReports ?? null),
      href: `${ARO_IA_001_COMMUNITY_REPORTS_PATH}?status=pending`,
      source: "community_reports open|reviewing",
      owner: "community_reports",
      filter: "status=pending",
    },
    {
      id: "meeting_reports",
      labelKo: "모임 신고 검토",
      labelEn: "Meeting report review",
      count: unavailable.has("meeting_reports") ? null : (queue?.meeting_reports ?? null),
      href: ARO_IA_001_MEETING_REPORTS_PATH,
      source: "meeting_reports actionable",
      owner: "meeting_reports",
    },
  ].filter((r) => r.count === null || (r.count ?? 0) > 0);

  return {
    domain: "community",
    titleKo: "커뮤니티 운영 대시보드",
    titleEn: "Community operations dashboard",
    descriptionKo: "게시글·댓글·신고를 확인하고 모더레이션/콘텐츠 관리로 이동합니다.",
    descriptionEn: "Review posts, comments, and reports — jump to moderation and content tools.",
    currentState: [
      {
        id: "posts_total",
        labelKo: "게시글",
        labelEn: "Posts",
        value: postsTotal,
        href: "/admin/community/posts",
        source: "community_posts",
      },
      {
        id: "comments_total",
        labelKo: "댓글",
        labelEn: "Comments",
        value: commentsTotal,
        href: "/admin/community/comments",
        source: "community_comments",
      },
      {
        id: "today_posts",
        labelKo: "오늘 게시글",
        labelEn: "Posts today",
        value: summary?.todayPosts ?? null,
        href: "/admin/community/posts?period=today",
        source: "community_posts.today",
      },
      {
        id: "today_comments",
        labelKo: "오늘 댓글",
        labelEn: "Comments today",
        value: summary?.todayComments ?? null,
        href: "/admin/community/comments?period=today",
        source: "community_comments.today",
      },
      {
        id: "hidden",
        labelKo: "숨김",
        labelEn: "Hidden",
        value: summary?.hiddenPosts ?? null,
        href: "/admin/community/posts?status=hidden",
        source: "community_posts.hidden",
      },
      {
        id: "deleted",
        labelKo: "삭제(상태)",
        labelEn: "Deleted (status)",
        value: deletedPosts,
        href: "/admin/community/posts?status=deleted",
        source: "community_posts.deleted",
      },
    ],
    actionRequired,
    domainHealth: [],
    issues: actionRequired,
    primaryEntries: [
      {
        id: "reports",
        labelKo: "일반 신고",
        labelEn: "General reports",
        href: ARO_IA_001_COMMUNITY_REPORTS_PATH,
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "meeting",
        labelKo: "모임 신고",
        labelEn: "Meeting reports",
        href: ARO_IA_001_MEETING_REPORTS_PATH,
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "posts",
        labelKo: "게시글 관리",
        labelEn: "Posts management",
        href: "/admin/community/posts",
        frequency: "FREQUENT",
      },
      {
        id: "comments",
        labelKo: "댓글 관리",
        labelEn: "Comments management",
        href: "/admin/community/comments",
        frequency: "FREQUENT",
      },
      {
        id: "topics",
        labelKo: "토픽",
        labelEn: "Topics",
        href: "/admin/community/topics",
        frequency: "OCCASIONAL",
      },
      {
        id: "settings",
        labelKo: "피드 설정",
        labelEn: "Feed settings",
        href: "/admin/community/settings",
        frequency: "CONFIGURATION",
      },
    ],
    contextEntries: [
      {
        id: "promo",
        labelKo: "홍보",
        labelEn: "Promotions",
        href: ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
        frequency: "OCCASIONAL",
      },
      {
        id: "point",
        labelKo: "포인트 정책",
        labelEn: "Point policies",
        href: ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH,
        frequency: "CONFIGURATION",
      },
      {
        id: "ads",
        labelKo: "광고/노출",
        labelEn: "Ads / exposure",
        href: ARO_IA_001_ADS_HUB_PATH,
        frequency: "OCCASIONAL",
      },
      {
        id: "support",
        labelKo: "고객지원",
        labelEn: "Support",
        href: ARO_IA_001_SUPPORT_PATH,
        frequency: "OCCASIONAL",
      },
      {
        id: "members",
        labelKo: "회원",
        labelEn: "Members",
        href: "/admin/users?from=community",
        frequency: "OCCASIONAL",
      },
      {
        id: "action_center",
        labelKo: "전역 Action Center",
        labelEn: "Global Action Center",
        href: "/admin#action-center",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "reset",
        labelKo: "테스트 커뮤니티 데이터 정리",
        labelEn: "Clean test community data",
        href: buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.community),
        frequency: "CONFIGURATION",
      },
    ],
    recent,
    sectionErrors,
  };
}

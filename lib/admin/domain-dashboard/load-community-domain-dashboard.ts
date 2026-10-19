/**
 * Community Domain Dashboard (설계 §D) — 지표 레지스트리 `community-metrics.ts` 를 읽는다 (read-only).
 * 처리 대기·위험·현재 상태 = 현재 시점, 기간 통계 = 선택 기간(마닐라, 기본 최근 7일).
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH,
  ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
  ARO_IA_001_COMMUNITY_REPORTS_PATH,
  ARO_IA_001_MEETING_REPORTS_PATH,
} from "@/lib/admin/aro-ia-001-community-common-links";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";
import { communityAuditTargetOrFilter } from "@/lib/admin/community-admin/community-admin-read-contract";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import {
  COMMUNITY_METRIC_DEFINITIONS,
  type CommunityMetricScope,
  type CommunityMetricValue,
} from "@/lib/admin/metrics/community-metrics";
import { loadCommunityMetrics } from "@/lib/admin/metrics/load-community-metrics";
import type {
  AdminDomainActionItem,
  AdminDomainDashboardModel,
  AdminDomainMetric,
  AdminDomainRecentItem,
} from "@/lib/admin/domain-dashboard/types";

export type CommunityDashboardInput = {
  /** today | 7d | 30d | custom (from,to = 마닐라 YYYY-MM-DD) — 기간 통계에만 적용 */
  period?: string | null;
  from?: string | null;
  to?: string | null;
  /** 보는 관리자의 권한 — 주면 권한 밖 지표를 숨긴다 */
  scope?: CommunityMetricScope;
  now?: Date;
};

function toAction(v: CommunityMetricValue): AdminDomainActionItem {
  return {
    id: v.id,
    labelKo: v.labelKo,
    labelEn: v.labelEn,
    count: v.value,
    href: v.href,
    source: v.id,
    owner: "community",
  };
}

function toMetric(v: CommunityMetricValue): AdminDomainMetric {
  return { id: v.id, labelKo: v.labelKo, labelEn: v.labelEn, value: v.value, href: v.href, source: v.id };
}

export async function loadCommunityDomainDashboard(input: CommunityDashboardInput = {}): Promise<AdminDomainDashboardModel> {
  const sectionErrors: string[] = [];
  const now = input.now ?? new Date();
  const sb = getSupabaseServer();

  let parsed = parseCommunityAdminPeriod(
    { period: input.period, from: input.from, to: input.to },
    { defaultPeriod: "7d", now }
  );
  if (!parsed.ok || !parsed.fromIso || !parsed.toIso) {
    if (!parsed.ok) sectionErrors.push(`period:${parsed.error}`);
    parsed = parseCommunityAdminPeriod({ period: "7d" }, { now });
  }
  const range = parsed.ok ? parsed : null;

  const snapshot = range
    ? await loadCommunityMetrics(sb, {
        period: {
          period: range.period,
          fromIso: range.fromIso as string,
          toIso: range.toIso as string,
          from: range.fromDate,
          to: range.toDate,
        },
        scope: input.scope ?? null,
        now,
      })
    : null;
  if (snapshot) sectionErrors.push(...snapshot.sectionErrors);

  const values = COMMUNITY_METRIC_DEFINITIONS.map((d) => snapshot?.values.get(d.id)).filter(
    (v): v is CommunityMetricValue => Boolean(v) && !v!.forbidden
  );
  const visible = (v: CommunityMetricValue) => v.showWhenZero || v.value === null || v.value > 0;

  const actionRequired = values.filter((v) => v.section === "action" && visible(v)).map(toAction);
  const issues = values.filter((v) => v.section === "risk" && visible(v)).map(toAction);
  const currentState = values.filter((v) => v.section === "state").map(toMetric);
  const periodStats = values.filter((v) => v.section === "period").map(toMetric);

  // D-5 최근 처리 — 관리자 조치 10건 · 최근 신고 10건
  const recent: AdminDomainRecentItem[] = [];
  const recentReports: AdminDomainRecentItem[] = [];
  try {
    const [auditRes, reportRes] = await Promise.all([
      (sb as any)
        .from("audit_logs")
        .select("id, actor_id, target_type, target_id, action, created_at")
        .eq("actor_type", "admin")
        .or(communityAuditTargetOrFilter())
        .order("created_at", { ascending: false })
        .limit(10),
      (sb as any)
        .from("community_reports")
        .select("id, target_type, target_id, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (auditRes.error) sectionErrors.push(`community_recent_actions:${auditRes.error.message}`);
    if (reportRes.error) sectionErrors.push(`community_recent_reports:${reportRes.error.message}`);
    const actorIds = [...new Set(((auditRes.data ?? []) as { actor_id?: string }[]).map((r) => r.actor_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: people } = await (sb as any).from("profiles").select("id, nickname, username").in("id", actorIds);
      for (const p of (people ?? []) as { id: string; nickname?: string | null; username?: string | null }[]) {
        names.set(p.id, p.nickname || p.username || "");
      }
    }
    for (const row of (auditRes.data ?? []) as Record<string, string | null>[]) {
      const who = (row.actor_id && names.get(row.actor_id)) || "관리자";
      recent.push({
        id: String(row.id),
        title: String(row.action ?? ""),
        metaKo: `${who} · ${row.target_type ?? ""}`,
        metaEn: `${who} · ${row.target_type ?? ""}`,
        href: `/admin/community/audit?targetType=${encodeURIComponent(String(row.target_type ?? ""))}&targetId=${encodeURIComponent(String(row.target_id ?? ""))}`,
        at: row.created_at ?? null,
      });
    }
    for (const row of (reportRes.data ?? []) as Record<string, string | null>[]) {
      recentReports.push({
        id: String(row.id),
        title: String(row.reason ?? row.id),
        metaKo: `${row.target_type ?? "post"} · ${row.status ?? ""}`,
        metaEn: `${row.target_type ?? "post"} · ${row.status ?? ""}`,
        href: `${ARO_IA_001_COMMUNITY_REPORTS_PATH}?reportId=${encodeURIComponent(String(row.id))}`,
        at: row.created_at ?? null,
      });
    }
  } catch (e) {
    sectionErrors.push(`community_recent:${e instanceof Error ? e.message : "error"}`);
  }

  return {
    domain: "community",
    titleKo: "커뮤니티 운영 대시보드",
    titleEn: "Community operations dashboard",
    descriptionKo: `처리 대기부터 확인하세요. 기준: 필리핀 시간 · 조치 사유는 ${COMMUNITY_ADMIN_REASON_MIN_LENGTH}자 이상.`,
    descriptionEn: "Start with pending items. Times in Philippine time (PHT).",
    currentState,
    actionRequired,
    domainHealth: periodStats,
    issues,
    issuesCta: { ko: "확인하기", en: "Review" },
    primaryEntries: [
      { id: "reports", labelKo: "신고 처리함", labelEn: "Reports", href: `${ARO_IA_001_COMMUNITY_REPORTS_PATH}?tab=pending`, frequency: "DAILY_CRITICAL" },
      { id: "meeting", labelKo: "모임 신고", labelEn: "Meeting reports", href: `${ARO_IA_001_MEETING_REPORTS_PATH}?status=pending`, frequency: "DAILY_CRITICAL" },
      { id: "posts", labelKo: "게시글", labelEn: "Posts", href: "/admin/community/posts", frequency: "FREQUENT" },
      { id: "comments", labelKo: "댓글", labelEn: "Comments", href: "/admin/community/comments", frequency: "FREQUENT" },
      { id: "members", labelKo: "작성자 조회", labelEn: "Authors", href: "/admin/community/members", frequency: "FREQUENT" },
      { id: "restrictions", labelKo: "활동 제한 회원", labelEn: "Restrictions", href: "/admin/community/restrictions?tab=active", frequency: "FREQUENT" },
      { id: "support", labelKo: "커뮤니티 문의", labelEn: "Community inquiries", href: "/admin/community/support?status=waiting", frequency: "FREQUENT" },
    ],
    contextEntries: [
      { id: "promo", labelKo: "게시글 홍보", labelEn: "Promotions", href: ARO_IA_001_COMMUNITY_PROMOTIONS_PATH, frequency: "OCCASIONAL" },
      { id: "points", labelKo: "포인트 내역", labelEn: "Point ledger", href: "/admin/community/points", frequency: "OCCASIONAL" },
      { id: "point", labelKo: "포인트 정책", labelEn: "Point policies", href: ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH, frequency: "CONFIGURATION" },
      { id: "stats", labelKo: "운영 통계", labelEn: "Statistics", href: "/admin/community/stats", frequency: "OCCASIONAL" },
      { id: "audit", labelKo: "운영 기록", labelEn: "Audit log", href: "/admin/community/audit", frequency: "OCCASIONAL" },
      { id: "topics", labelKo: "카테고리", labelEn: "Topics", href: "/admin/community/topics", frequency: "CONFIGURATION" },
      { id: "settings", labelKo: "운영 설정", labelEn: "Settings", href: "/admin/community/settings", frequency: "CONFIGURATION" },
      // 설계 §C-1: 최고 관리자만 노출 — 화면 재설계 시 권한으로 숨긴다.
      {
        id: "reset",
        labelKo: "테스트 커뮤니티 데이터 정리",
        labelEn: "Clean test community data",
        href: buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.community),
        frequency: "CONFIGURATION",
      },
    ],
    recent,
    recentReports,
    sectionErrors,
    lastUpdatedAt: snapshot?.lastUpdatedAt ?? new Date().toISOString(),
    periodRange: range ? { period: range.period, from: range.fromDate, to: range.toDate, timezone: "Asia/Manila" } : null,
    periodStats,
    metricValues: values.map((v) => ({ ...v })),
  };
}

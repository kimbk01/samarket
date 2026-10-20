"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberMetricGrid, AdminMemberPager } from "@/components/admin/users/AdminMemberMetricGrid";
import {
  memberCommunityAuthorAdminHref,
  memberCommunityCommentsAdminHref,
  memberCommunityPostHref,
  memberCommunityPostsAdminHref,
  memberCommunityReportsAdminHref,
  memberFeedAdsAdminHref,
} from "@/lib/admin-users/member-deep-links";
import type { MemberCommunitySection, MemberCommunityTabPayload } from "@/lib/admin-users/member-community-tab";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";

const SECTIONS: MemberCommunitySection[] = ["posts", "comments", "reports", "ads"];

export function AdminMemberCommunityPanel({ userId }: { userId: string }) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const [section, setSection] = useState<MemberCommunitySection>("posts");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: MemberCommunityTabPayload }>({
    kind: "loading",
  });
  const fmt = (value: string | null) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? formatAdminManilaDateTime(value) : value;
  };

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const qs = new URLSearchParams({ section, page: String(page), pageSize: "10" });
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/community?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as MemberCommunityTabPayload & { ok?: boolean };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ok", data });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, section, page]);

  if (state.kind === "loading") {
    return <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-sam-muted`}>{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm font-semibold text-sam-danger`}>
        {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
      </div>
    );
  }

  const { summary, total } = state.data;
  const hasNext = total.ok && page * 10 < total.value;

  return (
    <div className="space-y-4">
      <AdminMemberMetricGrid
        items={[
          { label: t("admin_users_cc_overview_posts"), metric: summary.posts },
          { label: t("admin_users_cc_overview_comments"), metric: summary.comments },
          { label: t("admin_users_cc_overview_reports"), metric: summary.reportsFiled },
          {
            label: safeT("admin_users_cc_summary_reported_posts", { fallbackKo: "신고된 게시물", fallbackEn: "Reported posts" }),
            metric: summary.reportedPosts,
          },
          { label: safeT("admin_users_cc_summary_ads", { fallbackKo: "광고 요청", fallbackEn: "Ad requests" }), metric: summary.ads },
          {
            label: safeT("admin_users_cc_last_activity", { fallbackKo: "최근 활동", fallbackEn: "Last activity" }),
            metric: summary.lastActivityAt,
            format: (value) => fmt(typeof value === "string" ? value : null),
          },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <AdminTabs
          ariaLabel={ko ? "커뮤니티 활동" : "Community activity"}
          syncUrl={false}
          value={section}
          onChange={(id) => {
            setSection(id as MemberCommunitySection);
            setPage(1);
          }}
          tabs={SECTIONS.map((id) => ({
            id,
            label:
              id === "posts"
                ? t("admin_users_cc_overview_posts")
                : id === "comments"
                  ? t("admin_users_cc_overview_comments")
                  : id === "reports"
                    ? t("admin_users_cc_overview_reports")
                    : safeT("admin_users_cc_summary_ads", { fallbackKo: "광고 요청", fallbackEn: "Ad requests" }),
          }))}
          className="min-w-0 flex-1"
        />
        <Link href={memberCommunityPostsAdminHref(userId)} className="ml-auto text-xs font-semibold text-[var(--admin-console-accent)]">
          {safeT("admin_users_cc_cta_open_community_admin", { fallbackKo: "커뮤니티 관리에서 열기", fallbackEn: "Open in Community admin" })}
        </Link>
      </div>

      <div className={`${ADMIN_USERS_LITE_CARD} overflow-x-auto`}>
        {section === "posts" ? (
          <table className="min-w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-sam-border bg-sam-surface-muted text-left text-[12px] font-semibold uppercase text-sam-muted">
                <th className="px-3 py-2">{t("admin_users_lite_col_status")}</th>
                <th className="px-3 py-2">{safeT("admin_users_cc_col_title", { fallbackKo: "제목", fallbackEn: "Title" })}</th>
                <th className="px-3 py-2">{t("admin_users_col_region")}</th>
                <th className="px-3 py-2">{t("admin_users_col_joined")}</th>
                <th className="px-3 py-2">{t("admin_users_cc_overview_reports")}</th>
                <th className="px-3 py-2">{t("admin_users_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {state.data.posts.map((row) => (
                <tr key={row.id} className="border-b border-sam-border">
                  <td className="px-3 py-2">
                    <AdminToneBadge tone={adminCommunityLabel("content_status", row.status, ko).tone}>
                      {adminCommunityLabel("content_status", row.status, ko).label}
                    </AdminToneBadge>
                  </td>
                  <td className="px-3 py-2 font-medium text-sam-fg">{row.title || row.preview || row.id}</td>
                  <td className="px-3 py-2 text-sam-muted">{row.topicSlug || row.category || "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-sam-muted">{fmt(row.createdAt)}</td>
                  <td className="px-3 py-2">{row.isReported ? t("admin_users_cc_overview_reports") : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-3 text-xs font-semibold text-[var(--admin-console-accent)]">
                      <Link href={memberCommunityPostHref(row.id)}>
                        {safeT("admin_users_cc_cta_view_post", { fallbackKo: "원문", fallbackEn: "Open" })}
                      </Link>
                      <Link href={memberCommunityAuthorAdminHref(userId)}>
                        {safeT("admin_users_cc_cta_open_community_admin", { fallbackKo: "커뮤니티 관리", fallbackEn: "Community admin" })}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {section === "comments"
          ? state.data.comments.map((row) => (
              <div key={row.id} className="space-y-1 px-4 py-3">
                <p className="text-sm text-sam-fg">{row.preview || "—"}</p>
                <p className="text-xs text-sam-muted">
                  {row.postTitle || row.postId} · {adminCommunityLabel("content_status", row.status, ko).label} · {fmt(row.createdAt)}
                </p>
                <Link href={memberCommunityCommentsAdminHref(userId)} className="text-xs font-semibold text-[var(--admin-console-accent)]">
                  {safeT("admin_users_cc_cta_open_community_admin", { fallbackKo: "커뮤니티 관리에서 열기", fallbackEn: "Open in Community admin" })}
                </Link>
              </div>
            ))
          : null}
        {section === "reports"
          ? state.data.reports.map((row) => (
              <div key={row.id} className="space-y-1 px-4 py-3">
                <p className="text-sm font-semibold text-sam-fg">{row.reasonType || row.id}</p>
                <p className="text-xs text-sam-muted">
                  {adminCommunityLabel("report_target", row.targetType, ko).label} <AdminTechId id={row.targetId} /> ·{" "}
                  {adminCommunityLabel("report_status", row.status, ko).label} · {fmt(row.createdAt)}
                </p>
                <Link href={memberCommunityReportsAdminHref(userId)} className="text-xs font-semibold text-[var(--admin-console-accent)]">
                  {safeT("admin_users_cc_cta_view_reports", { fallbackKo: "신고 내역 보기", fallbackEn: "View reports" })}
                </Link>
              </div>
            ))
          : null}
        {section === "ads"
          ? state.data.ads.map((row) => (
              <div key={row.id} className="space-y-1 px-4 py-3">
                <p className="text-sm font-semibold text-sam-fg">{row.placement || row.id}</p>
                <p className="text-xs text-sam-muted">
                  {row.status} · {row.domain} · {fmt(row.createdAt)}
                </p>
                <Link href={memberFeedAdsAdminHref()} className="text-xs font-semibold text-[var(--admin-console-accent)]">
                  {safeT("admin_users_cc_cta_view_ads", { fallbackKo: "광고 요청 보기", fallbackEn: "View ad requests" })}
                </Link>
              </div>
            ))
          : null}
        {(section === "posts" && state.data.posts.length === 0) ||
        (section === "comments" && state.data.comments.length === 0) ||
        (section === "reports" && state.data.reports.length === 0) ||
        (section === "ads" && state.data.ads.length === 0) ? (
          <p className="px-4 py-6 text-center text-sm text-sam-muted">
            {safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}
          </p>
        ) : null}
      </div>
      <AdminMemberPager page={page} hasNext={hasNext} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
    </div>
  );
}

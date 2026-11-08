"use client";

/**
 * 작성자 조회 (설계 §C-10) — 커뮤니티 활동 기준 회원 목록. 행 → 작성자 상세(조치 포함).
 * URL: q · restricted=1 · account=suspended|active · sort · from/to(PHT) · (호환) period · page · size
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatCommunityPoints, useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";

type MemberRow = {
  user_id: string;
  nickname: string | null;
  username: string | null;
  dibay_id: string | null;
  joined_at: string | null;
  post_count: number | null;
  comment_count: number | null;
  last_activity_at: string | null;
  account_status: string | null;
  member_status: string | null;
  points: number | null;
  active_restrictions: { id: string; restriction: string | null; start_at: string | null; end_at: string | null; reason: string | null }[] | null;
  warning_count: number | null;
  reports_received: number | null;
  reports_made: number | null;
};

type MembersResponse = { ok?: boolean; error?: string; total?: number; rows?: MemberRow[] };

const SORT_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "recent", labelKey: "admin_community_members_sort_recent" },
  { value: "posts", labelKey: "admin_community_members_sort_posts" },
  { value: "comments", labelKey: "admin_community_members_sort_comments" },
  { value: "joined", labelKey: "admin_community_members_sort_joined" },
  { value: "nickname", labelKey: "admin_community_members_sort_nickname" },
];
const SORTS = SORT_OPTIONS.map((o) => o.value);
const MEMBER_EXTRAS = ["restricted", "account"] as const;

function tabOf(restricted: string, account: string): string {
  if (restricted === "1") return "restricted";
  if (account === "suspended") return "suspended";
  return "all";
}

function num(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? formatAdminNumber(n) : "—";
}

/** `lang` 생략 시 한국어(기존 호출부 동작 유지). */
export function restrictionUntilLabel(endAt: string | null | undefined, lang: string = "ko"): string {
  if (!endAt) return translateBy(lang, "admin_community_members_restricted_forever");
  return translateBy(lang, "admin_community_members_restricted_until", { date: formatAdminManilaDateTime(endAt).slice(5, 10) });
}

export function AdminCommunityMembersPage() {
  const { t, language } = useI18n();
  const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const q = useCommunityListQuery({ extras: MEMBER_EXTRAS, sorts: SORTS, defaults: { sort: "recent" } });
  const restricted = q.query.extras.restricted;
  const account = q.query.extras.account;
  const tab = tabOf(restricted, account);
  const hasPeriod = Boolean(q.query.from || q.query.to || q.legacyPeriod);

  const { state, reload } = useCommunityAdminJson<MembersResponse>(
    `/api/admin/community/members?${q.apiParams().toString()}`
  );

  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  return (
    <CommunityListShell
      title={t("admin_community_members_title")}
      description={t("admin_community_members_desc")}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) =>
            q.patch({
              extras: {
                restricted: v === "restricted" ? "1" : "",
                account: v === "suspended" ? "suspended" : "",
              },
            })
          }
          tabs={[
            { value: "all", label: t("admin_community_members_tab_all") },
            { value: "restricted", label: t("admin_community_members_tab_restricted") },
            { value: "suspended", label: t("admin_community_members_tab_suspended") },
          ]}
        />
      }
      filterBar={
        <CommunityFilterBar lq={q} searchPlaceholder={t("admin_community_members_search_placeholder")} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_community_members_sort_label")}>
            <CommunitySelect value={q.query.sort || "recent"} onChange={q.setSort} options={sortOptions} />
          </CommunityFilterField>
        </CommunityFilterBar>
      }
      banner={
        hasPeriod ? <p className="text-[12px] text-sam-muted">{t("admin_community_members_period_note")}</p> : null
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody
        state={state}
        empty={rows.length === 0}
        lq={q}
        onRetry={reload}
        emptyMessage={t("admin_community_members_empty")}
        filteredEmptyMessage={t("admin_community_members_filtered_empty")}
      >
        <CommunityTable head={[
          t("admin_community_members_col_member"),
          t("admin_community_members_col_joined"),
          t("admin_community_members_col_posts"),
          t("admin_community_members_col_comments"),
          t("admin_community_members_col_reports_received"),
          t("admin_community_members_col_actions"),
          t("admin_community_members_col_account"),
          t("admin_community_members_col_points"),
          t("admin_community_members_col_last_activity"),
        ]}>
          {rows.map((r) => {
            const href = communityDetailHref(`/admin/community/members/${encodeURIComponent(r.user_id)}`, q.selfHref);
            const handle = r.dibay_id || r.username;
            const active = r.active_restrictions ?? [];
            return (
              <tr key={r.user_id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className={COMMUNITY_TD}>
                  <Link href={href} className="font-medium text-sam-info hover:underline">
                    {r.nickname?.trim() || t("admin_community_members_no_name")}
                  </Link>
                  {handle ? <div className="sam-text-xxs text-sam-muted">@{handle}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {r.joined_at ? formatAdminManilaDateTime(r.joined_at).slice(0, 10) : "—"}
                </td>
                <td className={COMMUNITY_TD}>{num(r.post_count)}</td>
                <td className={COMMUNITY_TD}>{num(r.comment_count)}</td>
                <td className={COMMUNITY_TD}>{num(r.reports_received)}</td>
                <td className={COMMUNITY_TD}>
                  <div className="flex flex-wrap gap-1">
                    {active.map((a) => (
                      <AdminToneBadge key={a.id} tone="danger">
                        {restrictionUntilLabel(a.end_at, language)}
                      </AdminToneBadge>
                    ))}
                    {r.warning_count ? <AdminToneBadge tone="warning">{t("admin_community_members_warnings", { n: r.warning_count })}</AdminToneBadge> : null}
                    {active.length === 0 && !r.warning_count ? <span className="text-sam-muted">{t("common_none")}</span> : null}
                  </div>
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="account_status" value={r.account_status} />
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(r.points)}</td>
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.last_activity_at} />
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>
    </CommunityListShell>
  );
}

"use client";

/**
 * 운영 통계 (설계 §C-21 · §D-4) — 선택 기간(필리핀 시간) 지표 + 일별 추이 + 카테고리별 활동 + CSV 내려받기.
 * URL: period=today|7d|30d|custom (+from,to) — 기본 최근 7일.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { type ReactNode } from "react";
import {
  COMMUNITY_TD,
  CommunityListShell,
  CommunityTable,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { CommunityStatsPeriodPicker } from "@/components/admin/community/dashboard/CommunityStatsPeriodPicker";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { AdminCommunityPeriodStats } from "@/lib/admin/metrics/load-community-metrics";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { communityAuditActionLabel } from "@/components/admin/community/audit/community-audit-labels";
import { communityPointTypeLabel } from "@/components/admin/community/points/community-point-labels";

type StatsResponse = {
  ok?: boolean;
  error?: string;
  period?: { period: string; from: string | null; to: string | null };
  lastUpdatedAt?: string;
  stats?: AdminCommunityPeriodStats;
};

function v(n: number | null | undefined): ReactNode {
  return typeof n === "number" && Number.isFinite(n) ? formatAdminNumber(n) : <AdminUnavailableChip ko />;
}

function Tile({ label, value, sub }: { label: string; value: number | null | undefined; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <span className="text-[13px] font-medium text-sam-muted">{label}</span>
      <span className="text-[20px] font-bold leading-7 text-sam-fg">{v(value)}</span>
      {sub ? <span className="text-[12px] text-sam-muted">{sub}</span> : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[14px] font-semibold text-sam-fg">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

const numberOr = (unavailable: string) => (x: number | null | undefined) =>
  typeof x === "number" ? formatAdminNumber(x) : unavailable;

export function AdminCommunityStatsPage() {
  const { t, language } = useI18n();
  const n = numberOr(t("admin_community_stats_unavailable"));
  const q = useCommunityQueryState();
  const period = q.get("period") || "7d";
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const url = `/api/admin/community/stats?${params.toString()}`;
  const { state, reload } = useCommunityAdminJson<StatsResponse>(customIncomplete ? null : url);
  const s = state.status === "ok" ? state.data.stats ?? null : null;
  const range = state.status === "ok" ? state.data.period : null;
  const updated = state.status === "ok" && state.data.lastUpdatedAt ? formatAdminManilaDateTime(state.data.lastUpdatedAt).slice(11) : null;

  const byAction = s
    ? Object.entries(s.admin_actions?.by_action ?? {})
        .map(([action, count]) => ({ label: communityAuditActionLabel(action, t), count }))
        .reduce<Map<string, number>>((m, x) => m.set(x.label, (m.get(x.label) ?? 0) + Number(x.count ?? 0)), new Map())
    : null;

  return (
    <div className="space-y-4" data-community-stats="1">
      <CommunityListShell
        title={t("admin_community_stats_title")}
        description={t("admin_community_stats_desc")}
        actions={
          <>
            <span className="text-[13px] text-sam-muted">{t("admin_community_stats_last_updated", { time: updated ? `${updated} PHT` : "—" })}</span>
            <AdminActionButton variant="secondary" onClick={reload} disabled={state.status === "loading"}>
              {t("admin_community_stats_reload")}
            </AdminActionButton>
            {!customIncomplete ? (
              <a
                href={`${url}&format=csv`}
                download
                data-admin-action="secondary"
                className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-[13px] font-semibold text-sam-fg hover:bg-sam-app"
              >
                {t("admin_community_stats_download_csv")}
              </a>
            ) : null}
          </>
        }
        filters={
          <>
            <CommunityStatsPeriodPicker
              key={`${period}-${q.get("from")}-${q.get("to")}`}
              period={period}
              from={q.get("from")}
              to={q.get("to")}
              onChange={(x) => q.set({ period: x.period === "7d" ? null : x.period, from: x.from || null, to: x.to || null })}
            />
            {range?.from && range?.to ? (
              <span className="pb-1.5 text-[13px] text-sam-muted">
                {range.from === range.to ? range.from : `${range.from} ~ ${range.to}`}
              </span>
            ) : null}
          </>
        }
      >
        {customIncomplete ? (
          <AdminEmptyState ko message={t("admin_community_stats_custom_incomplete")} />
        ) : state.status === "loading" && !state.data ? (
          <AdminLoadingState ko />
        ) : state.status === "error" ? (
          <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
        ) : !s ? (
          <AdminEmptyState ko message={t("admin_community_stats_empty")} />
        ) : (
          <div className="space-y-5 p-3">
            <Group title={t("admin_community_stats_g_posts")}>
              <Tile
                label={t("admin_community_stats_new_posts")}
                value={s.posts?.total}
                sub={t("admin_community_stats_posts_sub", {
                  member: n(s.posts?.member),
                  imported: n(s.posts?.imported),
                  admin: n(s.posts?.admin),
                })}
              />
              <Tile label={t("admin_community_stats_active_now")} value={s.posts?.active_now} />
              <Tile label={t("admin_community_stats_hidden_now")} value={s.posts?.hidden_now} />
              <Tile label={t("admin_community_stats_deleted_now")} value={s.posts?.deleted_now} />
            </Group>
            <Group title={t("admin_community_stats_g_comments")}>
              <Tile label={t("admin_community_stats_new_comments")} value={s.comments?.top_level} />
              <Tile label={t("admin_community_stats_new_replies")} value={s.comments?.replies} />
              <Tile label={t("admin_community_stats_active_authors")} value={s.authors?.active} sub={t("admin_community_stats_active_authors_sub")} />
              <Tile label={t("admin_community_stats_new_authors")} value={s.authors?.new} sub={t("admin_community_stats_new_authors_sub")} />
            </Group>
            <Group title={t("admin_community_stats_g_reports")}>
              <Tile
                label={t("admin_community_stats_reports_received")}
                value={s.reports?.received}
                sub={t("admin_community_stats_meeting_reports", { n: n(s.reports?.meeting_received) })}
              />
              <Tile
                label={t("admin_community_stats_reports_processed")}
                value={s.reports?.processed}
                sub={t("admin_community_stats_reports_processed_sub", {
                  resolved: n(s.reports?.resolved),
                  dismissed: n(s.reports?.dismissed),
                  meeting: n(s.reports?.meeting_processed),
                })}
              />
              <Tile label={t("admin_community_stats_admin_actions")} value={s.admin_actions?.total} />
            </Group>
            <Group title={t("admin_community_stats_g_reactions")}>
              <Tile label={t("admin_community_stats_post_views")} value={s.engagement?.post_views} />
              <Tile label={t("admin_community_stats_post_likes")} value={s.engagement?.post_likes} />
              <Tile label={t("admin_community_stats_comment_likes")} value={s.engagement?.comment_likes} />
            </Group>
            <Group title={t("admin_community_stats_g_charges")}>
              <Tile
                label={t("admin_community_stats_charges_approved")}
                value={s.charges?.approved_count}
                sub={t("admin_community_stats_charges_approved_sub", {
                  payment: n(s.charges?.approved_payment_amount),
                  points: n(s.charges?.approved_point_amount),
                })}
              />
              <Tile label={t("admin_community_stats_charges_rejected")} value={s.charges?.rejected_count} />
              <Tile
                label={t("admin_community_stats_new_promotions")}
                value={s.promotions?.new_count}
                sub={t("admin_community_stats_new_promotions_sub", { points: n(s.promotions?.new_point_cost) })}
              />
              <Tile label={t("admin_community_stats_ended_promotions")} value={s.promotions?.ended_count} />
            </Group>

            <section className="space-y-2">
              <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_community_stats_daily")}</h2>
              {(s.daily ?? []).length === 0 ? (
                <AdminEmptyState ko message={t("admin_community_stats_daily_empty")} />
              ) : (
                <div className="rounded-ui-rect border border-sam-border">
                  <CommunityTable head={[
                      t("admin_community_stats_col_date"),
                      t("admin_community_stats_col_posts"),
                      t("admin_community_stats_col_member_posts"),
                      t("admin_community_stats_col_imported"),
                      t("admin_community_stats_col_comments"),
                      t("admin_community_stats_active_authors"),
                      t("admin_community_stats_col_reports"),
                      t("admin_community_stats_admin_actions"),
                      t("admin_community_stats_col_rewarded"),
                      t("admin_community_stats_col_reclaimed"),
                    ]}>
                    {s.daily.map((d) => (
                      <tr key={d.date} className="border-b border-sam-border-soft">
                        <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{d.date}</td>
                        <td className={COMMUNITY_TD}>{n(d.posts)}</td>
                        <td className={COMMUNITY_TD}>{n(d.posts_member)}</td>
                        <td className={COMMUNITY_TD}>{n(d.posts_imported)}</td>
                        <td className={COMMUNITY_TD}>{n(d.comments)}</td>
                        <td className={COMMUNITY_TD}>{n(d.active_authors)}</td>
                        <td className={COMMUNITY_TD}>{n(d.reports)}</td>
                        <td className={COMMUNITY_TD}>{n(d.admin_actions)}</td>
                        <td className={COMMUNITY_TD}>{n(d.points_rewarded)}</td>
                        <td className={COMMUNITY_TD}>{n(d.points_reclaimed)}</td>
                      </tr>
                    ))}
                  </CommunityTable>
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-2">
                <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_community_stats_by_category")}</h2>
                {(s.topics ?? []).length === 0 ? (
                  <AdminEmptyState ko message={t("admin_community_stats_topics_empty")} />
                ) : (
                  <div className="rounded-ui-rect border border-sam-border">
                    <CommunityTable head={[t("admin_community_stats_col_category"), t("admin_community_stats_col_posts"), t("admin_community_stats_col_comments")]}>
                      {s.topics.map((tp, i) => (
                        <tr key={tp.topic_id ?? `none-${i}`} className="border-b border-sam-border-soft">
                          <td className={COMMUNITY_TD}>
                            {tp.name ||
                              (tp.topic_id ? t("admin_community_stats_unnamed_category") : t("admin_community_stats_no_category"))}
                          </td>
                          <td className={COMMUNITY_TD}>{n(tp.posts)}</td>
                          <td className={COMMUNITY_TD}>{n(tp.comments)}</td>
                        </tr>
                      ))}
                    </CommunityTable>
                  </div>
                )}
              </section>
              <section className="space-y-2">
                <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_community_stats_points")}</h2>
                {(s.points ?? []).length === 0 ? (
                  <AdminEmptyState ko message={t("admin_community_stats_points_empty")} />
                ) : (
                  <div className="rounded-ui-rect border border-sam-border">
                    <CommunityTable head={[t("admin_community_stats_col_type"), t("admin_community_stats_col_count"), t("admin_community_stats_col_points")]}>
                      {s.points.map((p) => (
                        <tr key={`${p.related_type}-${p.entry_type}`} className="border-b border-sam-border-soft">
                          <td className={COMMUNITY_TD}>{communityPointTypeLabel(p.related_type, p.entry_type, language)}</td>
                          <td className={COMMUNITY_TD}>{n(p.count)}</td>
                          <td className={COMMUNITY_TD}>{n(p.amount)} P</td>
                        </tr>
                      ))}
                    </CommunityTable>
                  </div>
                )}
              </section>
            </div>

            {byAction && byAction.size > 0 ? (
              <section className="space-y-2">
                <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_community_stats_by_action")}</h2>
                <div className="rounded-ui-rect border border-sam-border">
                  <CommunityTable head={[t("admin_community_stats_col_action"), t("admin_community_stats_col_count")]}>
                    {[...byAction.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([label, count]) => (
                        <tr key={label} className="border-b border-sam-border-soft">
                          <td className={COMMUNITY_TD}>{label}</td>
                          <td className={COMMUNITY_TD}>{formatAdminNumber(count)}</td>
                        </tr>
                      ))}
                  </CommunityTable>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </CommunityListShell>
    </div>
  );
}

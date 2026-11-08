"use client";

/**
 * 작성자 상세 (설계 §C-10) — ① 요약 카드 ② 활동 탭(글·댓글·받은 신고·낸 신고·조치·포인트·상위노출)
 * ③ 조치(경고 보내기 L2 · 활동 제한 L2 · 제한 해제 L2 · 계정 정지로 이동) ④ 기술 정보.
 * 구역 값이 null 이면 「확인 불가」 (빈 목록으로 대체하지 않는다).
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  communityDetailHref,
  communitySheetFetch,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge, AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import {
  adminCommunityLabel,
  communityRestrictionState,
  splitCommunityReportReason,
} from "@/lib/admin/status-labels/community-status-labels";
import {
  formatCommunityPoints,
  useCommunityAdminAccess,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";
import { restrictionUntilLabel } from "@/components/admin/community/members/AdminCommunityMembersPage";
import { communityPointTypeLabel } from "@/components/admin/community/points/community-point-labels";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

type Rec = Record<string, unknown>;

type SanctionRow = {
  id: string;
  sanction_type?: string | null;
  scope?: string | null;
  restriction?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  reason?: string | null;
  created_at?: string | null;
  revoked_at?: string | null;
  revoke_reason?: string | null;
};

type DetailResponse = {
  ok?: boolean;
  error?: string;
  userId?: string;
  isImportPrincipal?: boolean;
  profile?: Rec | null;
  summary?: {
    posts?: { total: number | null; active: number | null; hidden: number | null; deleted: number | null };
    comments?: { total: number | null; hidden: number | null; deleted: number | null };
    reportsReceived?: number | null;
    reportsMade?: number | null;
    activeRestrictions?: SanctionRow[] | null;
    warningCount?: number | null;
  };
  posts?: Rec[] | null;
  comments?: Rec[] | null;
  reportsReceived?: Rec[] | null;
  reportsMade?: Rec[] | null;
  sanctions?: SanctionRow[] | null;
  points?: Rec[] | null;
  promotions?: Rec[] | null;
  sectionErrors?: string[];
};

const TABS: { value: string; labelKey: MessageKey }[] = [
  { value: "posts", labelKey: "admin_community_mdetail_tab_posts" },
  { value: "comments", labelKey: "admin_community_mdetail_tab_comments" },
  { value: "received", labelKey: "admin_community_mdetail_tab_received" },
  { value: "made", labelKey: "admin_community_mdetail_tab_made" },
  { value: "sanctions", labelKey: "admin_community_mdetail_tab_sanctions" },
  { value: "points", labelKey: "admin_community_mdetail_tab_points" },
  { value: "promotions", labelKey: "admin_community_mdetail_tab_promotions" },
];

const DAY_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "1", labelKey: "admin_community_mdetail_days_1" },
  { value: "3", labelKey: "admin_community_mdetail_days_3" },
  { value: "7", labelKey: "admin_community_mdetail_days_7" },
  { value: "30", labelKey: "admin_community_mdetail_days_30" },
  { value: "forever", labelKey: "admin_community_mdetail_days_forever" },
];

type Sheet =
  | { kind: "warning" }
  | { kind: "restrict" }
  | { kind: "revoke"; sanction: SanctionRow }
  | null;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: number | null | undefined) => (typeof v === "number" ? formatAdminNumber(v) : null);
const abs = (iso: unknown) => (iso ? `${formatAdminManilaDateTime(String(iso))} PHT` : "—");

function CountOr({ v }: { v: number | null | undefined }) {
  const c = count(v);
  return c === null ? <AdminUnavailableChip ko /> : <>{c}</>;
}

export function AdminCommunityMemberDetailPage({ userId }: { userId: string }) {
  const { t, language } = useI18n();
  const q = useCommunityQueryState();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? "/admin/community/members";
  const tab = TABS.some((t) => t.value === q.get("tab")) ? q.get("tab") : "posts";
  const access = useCommunityAdminAccess();
  const canModerate = access.allowed("moderation");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const [restriction, setRestriction] = useState<"post" | "comment" | "all">("all");
  const [days, setDays] = useState("7");

  const { state, reload } = useCommunityAdminJson<DetailResponse>(
    `/api/admin/community/members/${encodeURIComponent(userId)}?limit=30`
  );

  const settle = (kind: CommunitySheetSettle, okMessage: string) => {
    setSheet(null);
    reload();
    if (kind === "done") setBanner({ ok: true, message: okMessage });
    else if (kind === "stale") setBanner({ ok: true, message: t("admin_community_post_stale") });
    else setBanner({ ok: true, message: t("admin_community_list_gone") });
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href={backHref} className="text-[13px] font-medium text-sam-muted underline">
        {t("admin_community_mdetail_back_to_list")}
      </Link>
    </div>
  );

  if (state.status === "loading" && !state.data) {
    return (
      <div className="space-y-3">
        {header}
        <AdminLoadingState ko />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="space-y-3">
        {header}
        {state.httpStatus === 404 ? (
          <AdminEmptyState ko message={t("admin_community_mdetail_not_found")} />
        ) : (
          <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
        )}
      </div>
    );
  }
  const d = state.data as DetailResponse;
  const p = (d.profile ?? null) as Rec | null;
  const nickname = s(p?.nickname).trim() || t("admin_community_kit_no_name");
  const handle = s(p?.dibay_id) || s(p?.username);
  const sum = d.summary ?? {};
  const active = sum.activeRestrictions ?? null;

  const sheetRows = [
    { label: t("admin_community_reports_member"), value: `${nickname}${handle ? ` (@${handle})` : ""}` },
    {
      label: t("admin_community_mdetail_row_current_restriction"),
      value:
        active === null
          ? t("admin_community_dash_unavailable")
          : active.length === 0
            ? t("admin_community_import_sources_none")
            : active.map((a) => `${adminCommunityLabel("restriction_scope", a.restriction, language !== "en").label} · ${restrictionUntilLabel(a.end_at, language)}`).join(", "),
    },
  ];

  return (
    <div data-community-member-detail="1" className="space-y-4">
      {header}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">{nickname}</h1>
          <p className="mt-1 sam-text-body text-sam-muted">
            {handle ? `@${handle} · ` : ""}{t("admin_community_mdetail_subtitle")}
          </p>
        </div>
      </header>

      <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />

      {d.isImportPrincipal ? (
        <p className="rounded-ui-rect border border-[var(--admin-console-accent)] bg-[var(--admin-console-active-bg)] px-3 py-2 text-[13px] text-[var(--admin-console-accent)]">
          {t("admin_community_mdetail_operator_account_note")}
        </p>
      ) : null}

      {/* ① 요약 */}
      <CommunitySummaryCard
        rows={[
          { label: t("admin_community_mdetail_row_nickname"), value: nickname },
          { label: "DIBAY ID", value: handle ? `@${handle}` : "—" },
          { label: t("admin_community_mdetail_row_joined"), value: abs(p?.created_at) },
          { label: t("admin_community_mdetail_row_account_status"), value: <CommunityStatusBadge domain="account_status" value={s(p?.status) || "active"} /> },
          {
            label: t("admin_community_mdetail_row_community_restriction"),
            value:
              active === null ? (
                <AdminUnavailableChip ko />
              ) : active.length === 0 ? (
                t("admin_community_import_sources_none")
              ) : (
                <span className="flex flex-wrap gap-1">
                  {active.map((a) => (
                    <AdminToneBadge key={a.id} tone="danger">
                      {adminCommunityLabel("restriction_scope", a.restriction, language !== "en").label} · {restrictionUntilLabel(a.end_at, language)}
                    </AdminToneBadge>
                  ))}
                </span>
              ),
          },
          {
            label: t("admin_community_mdetail_row_warnings"),
            value:
              sum.warningCount === null || sum.warningCount === undefined ? (
                <AdminUnavailableChip ko />
              ) : (
                t("admin_community_mdetail_times", { n: sum.warningCount })
              ),
          },
          {
            label: t("admin_community_comments_col_post"),
            value: (
              <span>
                <CountOr v={sum.posts?.total} />{" "}
                {t("admin_community_mdetail_posts_breakdown", {
                  active: count(sum.posts?.active) ?? t("admin_community_dash_unavailable"),
                  hidden: count(sum.posts?.hidden) ?? t("admin_community_dash_unavailable"),
                  deleted: count(sum.posts?.deleted) ?? t("admin_community_dash_unavailable"),
                })}
              </span>
            ),
          },
          {
            label: t("admin_community_comments_col_comment"),
            value: (
              <span>
                <CountOr v={sum.comments?.total} />{" "}
                {t("admin_community_mdetail_comments_breakdown", {
                  hidden: count(sum.comments?.hidden) ?? t("admin_community_dash_unavailable"),
                  deleted: count(sum.comments?.deleted) ?? t("admin_community_dash_unavailable"),
                })}
              </span>
            ),
          },
          { label: t("admin_community_mdetail_tab_received"), value: <CountOr v={sum.reportsReceived} /> },
          { label: t("admin_community_mdetail_tab_made"), value: <CountOr v={sum.reportsMade} /> },
          { label: t("admin_community_mdetail_tab_points"), value: formatCommunityPoints(n(p?.points)) },
        ]}
      />

      {/* ③ 조치 */}
      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <AdminActionButton
          variant="secondary"
          disabled={!canModerate || d.isImportPrincipal}
          title={access.deniedTitle("moderation")}
          onClick={() => setSheet({ kind: "warning" })}
        >
          {t("admin_community_mdetail_send_warning")}
        </AdminActionButton>
        <AdminActionButton
          variant="danger"
          disabled={!canModerate || d.isImportPrincipal}
          title={access.deniedTitle("moderation")}
          onClick={() => setSheet({ kind: "restrict" })}
        >
          {t("admin_community_mdetail_restrict_action")}
        </AdminActionButton>
        {(active ?? []).map((a) => (
          <AdminActionButton
            key={a.id}
            variant="neutral"
            disabled={!canModerate}
            title={access.deniedTitle("moderation")}
            onClick={() => setSheet({ kind: "revoke", sanction: a })}
          >
            {t("admin_community_mdetail_revoke_scope", { scope: adminCommunityLabel("restriction_scope", a.restriction, language !== "en").label })}
          </AdminActionButton>
        ))}
        <span className="ml-auto" />
        <AdminActionLink href={`/admin/users/${encodeURIComponent(userId)}`} variant="danger">
          {t("admin_community_mdetail_go_suspend")}
        </AdminActionLink>
      </div>

      {/* ② 활동 */}
      <CommunityTabs tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey) }))} value={tab} onChange={(v) => q.set({ tab: v === "posts" ? null : v })} />
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <TabBody tab={tab} d={d} selfHref={q.selfHref} userId={userId} />
      </div>

      {/* ④ 기술 정보 */}
      <AdminTechDetails ko>
        <div>user_id: {userId}</div>
        {(d.sectionErrors ?? []).map((e) => (
          <div key={e}>{e}</div>
        ))}
      </AdminTechDetails>

      {sheet?.kind === "warning" ? (
        <CommunityActionSheet
          title={t("admin_community_mdetail_warn_title")}
          rows={sheetRows}
          notice={t("admin_community_mdetail_notice_warning")}
          reason={{ minLength: 2, placeholder: t("admin_community_mdetail_warning_reason_placeholder") }}
          confirmLabel={t("admin_community_mdetail_send_warning_btn")}
          onSubmit={(reason) =>
            communitySheetFetch("/api/admin/community/restrictions", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, kind: "warning", reason }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, t("admin_community_mdetail_warning_sent"))}
        />
      ) : null}

      {sheet?.kind === "restrict" ? (
        <CommunityActionSheet
          title={t("admin_community_mdetail_restrict_title")}
          rows={sheetRows}
          notice={t("admin_community_mdetail_notice_restrict")}
          reason={{ minLength: 2, placeholder: t("admin_community_mdetail_restrict_reason_placeholder") }}
          destructive
          confirmLabel={t("admin_community_mdetail_restrict_btn")}
          onSubmit={(reason) =>
            communitySheetFetch("/api/admin/community/restrictions", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                kind: "community_restriction",
                restriction,
                days: days === "forever" ? null : Number(days),
                reason,
              }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, t("admin_community_mdetail_restricted"))}
        >
          <fieldset className="space-y-1">
            <legend className="sam-text-helper font-medium text-sam-fg">{t("admin_community_mdetail_scope")}</legend>
            {(["post", "comment", "all"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-[13px]">
                <input type="radio" name="restriction" checked={restriction === v} onChange={() => setRestriction(v)} />
                {adminCommunityLabel("restriction_scope", v, language !== "en").label}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="sam-text-helper font-medium text-sam-fg">{t("admin_community_mdetail_period")}</span>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 block rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px]"
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </CommunityActionSheet>
      ) : null}

      {sheet?.kind === "revoke" ? (
        <CommunityActionSheet
          title={t("admin_community_mdetail_lift_title")}
          rows={[
            ...sheetRows.slice(0, 1),
            {
              label: t("admin_community_mdetail_row_restriction_to_lift"),
              value: `${adminCommunityLabel("restriction_scope", sheet.sanction.restriction, language !== "en").label} · ${restrictionUntilLabel(
                sheet.sanction.end_at,
                language
              )}`,
            },
            { label: t("admin_community_mdetail_row_restriction_reason"), value: sheet.sanction.reason || "—" },
          ]}
          reason={{ minLength: 2, placeholder: t("admin_community_mdetail_lift_reason_placeholder") }}
          confirmLabel={t("admin_community_mdetail_lift_btn")}
          onSubmit={(reason) =>
            communitySheetFetch(`/api/admin/community/restrictions/${encodeURIComponent(sheet.sanction.id)}/revoke`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, t("admin_community_mdetail_lifted"))}
        />
      ) : null}
    </div>
  );
}

function Unavailable() {
  const { t } = useI18n();
  return (
    <div className="p-4">
      <AdminEmptyState ko message={t("admin_community_mdetail_tab_unavailable")} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-4">
      <AdminEmptyState ko message={text} />
    </div>
  );
}

function TabBody({ tab, d, selfHref, userId }: { tab: string; d: DetailResponse; selfHref: string; userId: string }): ReactNode {
  const { t, language } = useI18n();
  const link = (href: string, label: string) => (
    <Link href={communityDetailHref(href, selfHref)} className="font-medium text-[var(--admin-console-accent)] hover:underline">
      {label}
    </Link>
  );
  if (tab === "posts") {
    if (d.posts == null) return <Unavailable />;
    if (d.posts.length === 0) return <Empty text={t("admin_community_mdetail_no_posts")} />;
    return (
      <CommunityTable head={[
          t("admin_community_postd_field_title"),
          t("admin_community_postd_row_origin"),
          t("admin_community_comments_col_status"),
          t("admin_community_comments_col_comment"),
          t("admin_community_reports_col_reports"),
          t("admin_community_mdetail_th_published"),
        ]}>
        {d.posts.map((r) => (
          <tr key={s(r.id)} className="border-b border-sam-border-soft">
            <td className={COMMUNITY_TD}>{link(`/admin/community/posts/${encodeURIComponent(s(r.id))}`, s(r.title) || t("admin_community_comments_no_title"))}</td>
            <td className={COMMUNITY_TD}>
              <CommunityStatusBadge domain="origin_kind" value={s(r.origin_kind) || "member"} />
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityStatusBadge domain="content_status" value={s(r.status)} />
            </td>
            <td className={COMMUNITY_TD}>{n(r.comment_count) ?? "—"}</td>
            <td className={COMMUNITY_TD}>{n(r.report_count) ?? "—"}</td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={s(r.published_at) || s(r.created_at)} />
            </td>
          </tr>
        ))}
      </CommunityTable>
    );
  }
  if (tab === "comments") {
    if (d.comments == null) return <Unavailable />;
    if (d.comments.length === 0) return <Empty text={t("admin_community_mdetail_no_comments")} />;
    return (
      <CommunityTable head={[
          t("admin_community_comments_row_content"),
          t("admin_community_mdetail_th_kind"),
          t("admin_community_comments_col_status"),
          t("admin_community_mdetail_th_written"),
        ]}>
        {d.comments.map((r) => (
          <tr key={s(r.id)} className="border-b border-sam-border-soft">
            <td className={`${COMMUNITY_TD} max-w-[28rem]`}>
              {link(`/admin/community/comments?commentId=${encodeURIComponent(s(r.id))}`, s(r.content).slice(0, 80) || t("admin_community_mdetail_no_content"))}
            </td>
            <td className={COMMUNITY_TD}>{r.parent_id ? t("admin_community_mdetail_reply") : t("admin_community_comments_col_comment")}</td>
            <td className={COMMUNITY_TD}>
              <CommunityStatusBadge domain="content_status" value={s(r.status)} />
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={s(r.created_at)} />
            </td>
          </tr>
        ))}
      </CommunityTable>
    );
  }
  if (tab === "received" || tab === "made") {
    const list = tab === "received" ? d.reportsReceived : d.reportsMade;
    if (list == null) return <Unavailable />;
    if (list.length === 0) return <Empty text={tab === "received" ? t("admin_community_mdetail_no_received") : t("admin_community_mdetail_no_made")} />;
    return (
      <CommunityTable head={[
          t("admin_community_mdetail_th_report_reason"),
          t("admin_community_reports_col_target"),
          t("admin_community_comments_col_status"),
          t("admin_community_mdetail_th_received_at"),
        ]}>
        {list.map((r) => {
          const { code, text } = splitCommunityReportReason(s(r.reason));
          return (
            <tr key={s(r.id)} className="border-b border-sam-border-soft">
              <td className={`${COMMUNITY_TD} max-w-[28rem]`}>
                {link(
                  `/admin/community/reports?reportId=${encodeURIComponent(s(r.id))}`,
                  adminCommunityLabel("report_reason", code, language !== "en").label
                )}
                {text ? <div className="text-[12px] text-sam-muted">{text.slice(0, 80)}</div> : null}
              </td>
              <td className={COMMUNITY_TD}>{adminCommunityLabel("report_target", s(r.target_type) || "post", language !== "en").label}</td>
              <td className={COMMUNITY_TD}>
                <CommunityStatusBadge domain="report_status" value={s(r.status)} />
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={s(r.created_at)} />
              </td>
            </tr>
          );
        })}
      </CommunityTable>
    );
  }
  if (tab === "sanctions") {
    if (d.sanctions == null) return <Unavailable />;
    return (
      <div className="p-3">
        <CommunityTimeline
          emptyText={t("admin_community_kit_no_actions")}
          items={d.sanctions.map((r) => {
            const state = communityRestrictionState(r);
            const kind = adminCommunityLabel("sanction_kind", r.sanction_type, language !== "en").label;
            const scope = r.restriction ? ` · ${adminCommunityLabel("restriction_scope", r.restriction, language !== "en").label}` : "";
            const until = r.sanction_type === "community_restriction" ? ` · ${restrictionUntilLabel(r.end_at, language)}` : "";
            const st = r.sanction_type === "warning" ? "" : ` (${adminCommunityLabel("restriction_state", state, language !== "en").label})`;
            return {
              id: r.id,
              at: s(r.created_at) || s(r.start_at),
              actor: t("admin_community_dash_admin_fallback"),
              action: `${kind}${scope}${until}${st}`,
              reason: r.revoked_at
                ? `${r.reason ?? ""}\n${t("admin_community_mdetail_lifted_reason", { reason: r.revoke_reason ?? "—" })}`
                : r.reason,
            };
          })}
        />
      </div>
    );
  }
  if (tab === "points") {
    if (d.points == null) return <Unavailable />;
    if (d.points.length === 0) return <Empty text={t("admin_community_mdetail_no_points")} />;
    return (
      <>
        <CommunityTable head={[
            t("admin_community_meeting_events_col_time"),
            t("admin_community_comments_col_type_kind"),
            t("admin_community_mdetail_tab_points"),
            t("admin_community_mdetail_th_balance"),
            t("admin_community_comments_row_content"),
          ]}>
          {d.points.map((r) => {
            const amt = n(r.amount) ?? 0;
            return (
              <tr key={s(r.id)} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={s(r.created_at)} absolute />
                </td>
                <td className={COMMUNITY_TD}>{communityPointTypeLabel(s(r.related_type), s(r.entry_type), language)}</td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap ${amt < 0 ? "text-sam-danger" : "text-sam-success"}`}>
                  {amt > 0 ? "+" : ""}
                  {formatAdminNumber(amt)} P
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(n(r.balance_after))}</td>
                <td className={COMMUNITY_TD}>{s(r.description) || "—"}</td>
              </tr>
            );
          })}
        </CommunityTable>
        <div className="border-t border-sam-border-soft px-3 py-2 text-[13px]">
          <Link href={`/admin/community/points?userId=${encodeURIComponent(userId)}&period=all`} className="text-[var(--admin-console-accent)] underline">
            {t("admin_community_mdetail_points_all")}
          </Link>
        </div>
      </>
    );
  }
  if (d.promotions == null) return <Unavailable />;
  if (d.promotions.length === 0) return <Empty text={t("admin_community_mdetail_no_promotions")} />;
  return (
    <CommunityTable head={[
            t("admin_community_comments_col_post"),
            t("admin_community_mdetail_th_period"),
            t("admin_community_mdetail_th_paid_points"),
            t("admin_community_comments_col_status"),
            t("admin_community_mdetail_th_requested"),
          ]}>
      {d.promotions.map((r) => (
        <tr key={s(r.id)} className="border-b border-sam-border-soft">
          <td className={COMMUNITY_TD}>
            {s(r.target_id)
              ? link(`/admin/community/posts/${encodeURIComponent(s(r.target_id))}`, s(r.target_title) || t("admin_community_comments_col_post"))
              : s(r.target_title) || "—"}
          </td>
          <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
            {t("admin_community_mdetail_days_n", { n: n(r.duration_days) ?? "—" })} · {r.start_at ? formatAdminManilaDateTime(s(r.start_at)).slice(5, 10) : "—"} ~{" "}
            {r.end_at ? formatAdminManilaDateTime(s(r.end_at)).slice(5, 10) : "—"}
          </td>
          <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(n(r.point_cost))}</td>
          <td className={COMMUNITY_TD}>
            <CommunityStatusBadge domain="promotion_status" value={s(r.order_status)} />
          </td>
          <td className={COMMUNITY_TD}>
            <CommunityTimeCell iso={s(r.created_at)} />
          </td>
        </tr>
      ))}
    </CommunityTable>
  );
}

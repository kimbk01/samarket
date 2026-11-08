"use client";

/**
 * 거래 신고 `/admin/trade/reports` (설계 v2 §C-4).
 * 탭: 처리 대기 / 처리 완료 / 반려 / 전체 (건수) · 필터: 대상 유형 · 접수 기간(PHT) · 특정 대상(?targetId=).
 * 행을 누르면 처리 시트 — 신고 내용·대상 글·대상 회원·같은 게시물 다른 신고·처리 기록·회원의 기존 조치.
 * 처리(반려·게시물 숨김·경고·거래 활동 제한)는 POST /api/admin/trade/reports/:id 한 번 (2단계 확인·사유).
 * 계정 정지·차단은 여기서 하지 않는다 — 판매자·구매자 상세의 계정 조치로 이동.
 * URL: tab(탭 — 대시보드 딥링크) · targetType · targetId · reporterId · sellerId · from/to(PHT) · (호환) period ·
 *      reportId(시트) · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import {
  CommunityBannerView,
  CommunitySection,
  communityActionFetch,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";
import {
  TradeMemberCell,
  TradePostThumb,
  TradeStageBadge,
  TradeVisibilityBadges,
  tradeDetailHref,
  tradeErrorText,
} from "@/components/admin/trade/kit/TradeAdminKit";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  TRADE_RESTRICTION_DAY_SELECT,
  tradeRestrictionDaysLabel,
  tradeRestrictionScopeLabel,
  tradeSanctionKindLabel,
  tradeSanctionPeriodText,
  tradeSanctionStatusOf,
} from "@/components/admin/trade/restrictions/TradeRestrictionsPage";

const LIST_EXTRAS = ["targetType", "targetId", "reporterId", "sellerId"] as const;
const REASON_MIN = 2;

type Rec = Record<string, unknown>;
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

type TabKey = "open" | "sanctioned" | "rejected" | "all";
const TABS: { value: TabKey; labelKey: MessageKey }[] = [
  { value: "open", labelKey: "admin_trade_reports_st_pending" },
  { value: "sanctioned", labelKey: "admin_trade_reports_st_done" },
  { value: "rejected", labelKey: "admin_trade_promo_st_rejected" },
  { value: "all", labelKey: "common_all" },
];
const EMPTY_TEXT: Record<TabKey, MessageKey> = {
  open: "admin_trade_reports_empty_open",
  sanctioned: "admin_trade_reports_empty_done",
  rejected: "admin_trade_reports_empty_rejected",
  all: "admin_trade_reports_empty_all",
};

const TARGET_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_trade_reports_target_all" },
  { value: "product", labelKey: "admin_trade_audit_target_post" },
  { value: "user", labelKey: "admin_trade_points_member" },
  { value: "chat_room", labelKey: "admin_trade_reports_target_chat_room" },
];

type ReportPost = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  images: unknown;
  moderation_state: string | null;
  owner_state: string | null;
  seller_listing_state: string | null;
};

type ReportRow = {
  id: string;
  reporter_id: string | null;
  reporter_label: string | null;
  target_type: string | null;
  target_id: string | null;
  product_id: string | null;
  reason_code: string | null;
  reason_text: string | null;
  status: string | null;
  admin_note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by_label: string | null;
  target_user_id: string | null;
  target_user_label: string | null;
  post: ReportPost | null;
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  tabCounts?: Partial<Record<TabKey, number | null>>;
  rows?: ReportRow[];
};

/* ───────── 라벨 (다른 거래 화면에서도 사용) ───────── */

const STATUS_LABEL: Record<string, { labelKey: MessageKey; tone: AdminTone }> = {
  pending: { labelKey: "admin_trade_reports_st_pending", tone: "waiting" },
  reviewing: { labelKey: "admin_trade_reports_st_reviewing", tone: "progress" },
  sanctioned: { labelKey: "admin_trade_reports_st_done", tone: "success" },
  resolved: { labelKey: "admin_trade_reports_st_done", tone: "success" },
  reviewed: { labelKey: "admin_trade_reports_st_done", tone: "success" },
  rejected: { labelKey: "admin_trade_promo_st_rejected", tone: "neutral" },
};

export function TradeReportStatusBadge({ value }: { value: string | null | undefined }) {
  const { t } = useI18n();
  const hit = STATUS_LABEL[s(value)];
  return <AdminToneBadge tone={hit?.tone ?? "neutral"}>{t(hit?.labelKey ?? "admin_trade_label_unknown")}</AdminToneBadge>;
}

export function isTradeReportOpen(status: string | null | undefined): boolean {
  return status === "pending" || status === "reviewing";
}

const EXTRA_REASON: Record<string, MessageKey> = {
  abusive_language: "admin_trade_reports_reason_abusive",
  inappropriate_item: "admin_trade_reports_reason_banned_item",
};

/** 신고 사유 코드 → 문구 (모르는 코드는 「기타」) */
export function tradeReportReasonLabel(t: Translate, code: string | null | undefined): string {
  const c = s(code).trim().toLowerCase();
  if (!c) return t("admin_trade_reports_reason_none");
  if (EXTRA_REASON[c]) return t(EXTRA_REASON[c]);
  const l = adminChatLabel("report_reason", c, getRuntimeAppLanguage() !== "en");
  return l.known ? l.label : t("admin_trade_audit_target_other");
}

export function tradeReportTargetLabel(t: Translate, targetType: string | null | undefined): string {
  switch (s(targetType)) {
    case "product":
    case "post":
      return t("admin_trade_audit_target_post");
    case "user":
      return t("admin_trade_points_member");
    case "chat_room":
    case "chat":
      return t("admin_trade_reports_target_chat_room");
    case "chat_message":
      return t("admin_trade_reports_target_chat_message");
    case "comment":
      return t("admin_trade_reports_target_comment");
    default:
      return t("admin_trade_audit_target_other");
  }
}

const ACTION_LABEL: Record<string, MessageKey> = {
  reject: "admin_trade_promo_st_rejected",
  resolve: "admin_trade_reports_act_resolve",
  product_hide: "admin_trade_reports_act_hide_post",
  warn: "admin_trade_restrict_badge_warning",
  trade_restriction: "admin_trade_restrict_title",
  chat_ban: "admin_trade_reports_act_chat_ban_legacy",
};

/* ───────── 목록 ───────── */

export function TradeReportsPage() {
  const { t } = useI18n();
  /** `tab`·`reportId` 는 조회 조건 밖 키 — [초기화] 후에도 유지 */
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: LIST_EXTRAS });
  const tabRaw = qs.get("tab");
  const tab: TabKey = (TABS.find((t) => t.value === tabRaw)?.value ?? "open") as TabKey;
  const { targetType, targetId, reporterId, sellerId } = lq.query.extras;
  const reportId = qs.get("reportId");
  const [banner, setBanner] = useState<CommunityBanner>(null);

  const params = lq.apiParams();
  params.set("tab", tab);
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/trade/reports?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const counts = state.data?.tabCounts ?? {};

  const openDetail = (id: string) => qs.set({ reportId: id }, { keepPage: true });
  const closeDetail = () => qs.set({ reportId: null }, { keepPage: true });

  return (
    <CommunityListShell
      title={t("admin_trade_reports_title")}
      description={t("admin_trade_reports_desc")}
      actions={
        <AdminActionButton variant="secondary" onClick={reload}>
          {t("admin_trade_reports_refresh")}
        </AdminActionButton>
      }
      banner={<CommunityBannerView banner={banner} onClose={() => setBanner(null)} />}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "open" ? null : v })}
          tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey), count: counts[x.value] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showSearch={false} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_trade_audit_target_type")}>
            <CommunitySelect value={targetType} onChange={(v) => lq.setExtra("targetType", v)} options={TARGET_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
          </CommunityFilterField>
          {targetId ? (
            <CommunityFilterField label={t("admin_trade_audit_target")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {t("admin_trade_reports_target_only")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("targetId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {sellerId ? (
            <CommunityFilterField label={t("admin_trade_points_member")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {t("admin_trade_reports_member_only")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("sellerId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {reporterId ? (
            <CommunityFilterField label={t("admin_trade_reports_reporter")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {t("admin_trade_reports_reporter_only")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("reporterId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={lq} onRetry={reload} emptyMessage={t(EMPTY_TEXT[tab])}>
        <CommunityTable head={[t("admin_trade_reports_received"), t("admin_trade_audit_target"), t("admin_trade_reports_reason"), t("admin_trade_reports_reporter"), t("admin_trade_th_status"), t("admin_trade_reports_th_handled"), t("admin_trade_restrict_th_handle")]}>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => openDetail(r.id)}
              className={`cursor-pointer border-b border-sam-border-soft hover:bg-sam-app ${reportId === r.id ? "bg-sam-warning-soft" : ""}`}
            >
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.created_at} />
              </td>
              <td className={COMMUNITY_TD}>
                <ReportTargetCell row={r} returnTo={lq.selfHref} />
              </td>
              <td className={COMMUNITY_TD}>
                <span className="font-medium text-sam-fg">{tradeReportReasonLabel(t, r.reason_code)}</span>
                {r.reason_text ? (
                  <p className="line-clamp-2 max-w-[16rem] sam-text-xxs text-sam-muted">{r.reason_text}</p>
                ) : null}
              </td>
              <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
                <TradeMemberCell userId={r.reporter_id} label={r.reporter_label} returnTo={lq.selfHref} />
              </td>
              <td className={COMMUNITY_TD}>
                <TradeReportStatusBadge value={r.status} />
              </td>
              <td className={COMMUNITY_TD}>
                {r.resolved_at ? (
                  <span className="flex flex-col">
                    <span>{r.resolved_by_label ?? t("admin_trade_confirm_source_admin")}</span>
                    <span className="sam-text-xxs text-sam-muted">
                      <CommunityTimeCell iso={r.resolved_at} />
                    </span>
                  </span>
                ) : (
                  <span className="text-sam-muted">—</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                <AdminActionButton
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(r.id);
                  }}
                >
                  {isTradeReportOpen(r.status) ? t("admin_trade_restrict_th_handle") : t("admin_trade_reports_view")}
                </AdminActionButton>
              </td>
            </tr>
          ))}
        </CommunityTable>
      </CommunityListBody>

      {reportId ? (
        <TradeReportDetailSheet
          reportId={reportId}
          returnTo={lq.selfHref}
          onClose={closeDetail}
          onDecided={(b) => {
            setBanner(b);
            reload();
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}

function ReportTargetCell({ row, returnTo }: { row: ReportRow; returnTo: string }) {
  const { t } = useI18n();
  if (row.post) {
    return (
      <span className="flex items-start gap-2">
        <TradePostThumb post={row.post} size={40} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 max-w-[14rem] font-medium text-sam-fg">{row.post.title?.trim() || t("admin_trade_posts_no_title")}</span>
          <span className="sam-text-xxs text-sam-muted" onClick={(e) => e.stopPropagation()}>
            {t("admin_trade_reports_seller_label")} <TradeMemberCell userId={row.target_user_id} label={row.target_user_label} returnTo={returnTo} />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="sam-text-xxs text-sam-muted">{tradeReportTargetLabel(t, row.target_type)}</span>
      {row.target_user_id ? (
        <span onClick={(e) => e.stopPropagation()}>
          <TradeMemberCell userId={row.target_user_id} label={row.target_user_label} returnTo={returnTo} />
        </span>
      ) : row.target_type === "product" || row.target_type === "post" ? (
        <span className="text-sam-muted">{t("admin_trade_reports_deleted_post")}</span>
      ) : null}
    </span>
  );
}

/* ───────── 처리 시트 ───────── */

type DetailResponse = {
  ok?: boolean;
  error?: string;
  report?: Rec;
  post?: Rec | null;
  targetUser?: { id: string; label: string | null } | null;
  siblings?: Rec[];
  actions?: Rec[];
  sanctions?: Rec[];
};

type Decision = "reject" | "hide" | "warn" | "restrict";

const DECISION_TEXT: Record<Decision, { title: MessageKey; confirm: MessageKey; notice: MessageKey }> = {
  reject: {
    title: "admin_trade_audit_act_report_reject",
    confirm: "admin_trade_promo_st_rejected_btn",
    notice: "admin_trade_reports_reject_notice",
  },
  hide: {
    title: "admin_trade_reports_act_hide_post",
    confirm: "admin_trade_reports_act_hide_post",
    notice: "admin_trade_reports_hide_notice",
  },
  warn: {
    title: "admin_trade_restrict_badge_warning",
    confirm: "admin_trade_restrict_send_warning",
    notice: "admin_trade_reports_warn_notice",
  },
  restrict: {
    title: "admin_trade_restrict_title",
    confirm: "admin_trade_restrict_title",
    notice: "admin_trade_reports_restrict_notice",
  },
};

function TradeReportDetailSheet({
  reportId,
  returnTo,
  onClose,
  onDecided,
}: {
  reportId: string;
  returnTo: string;
  onClose: () => void;
  onDecided: (banner: CommunityBanner) => void;
}) {
  const { t, language } = useI18n();
  const { state, reload } = useCommunityAdminJson<DetailResponse>(
    `/api/admin/trade/reports/${encodeURIComponent(reportId)}`
  );
  const [decision, setDecision] = useState<Decision | null>(null);
  const [scope, setScope] = useState<"post" | "chat" | "all">("all");
  const [days, setDays] = useState("7");
  const [hidePost, setHidePost] = useState(false);
  const [sheetBanner, setSheetBanner] = useState<CommunityBanner>(null);
  const lastJson = useRef<Rec>({});

  const d = state.data;
  const report = (d?.report ?? null) as Rec | null;
  const post = (d?.post ?? null) as Rec | null;
  const targetUser = d?.targetUser ?? null;
  const open = report ? isTradeReportOpen(s(report.status)) : false;

  const settle = (kind: CommunitySheetSettle) => {
    const chosen = decision;
    setDecision(null);
    reload();
    let b: CommunityBanner;
    if (kind === "stale") b = { tone: "warning", text: t("admin_community_post_stale") };
    else if (kind === "gone") b = { tone: "error", text: tradeErrorText("not_found") };
    else {
      const json = lastJson.current;
      const extra = communityWarningsOf(json, language);
      const closed = Number(json.closedSiblings ?? 0);
      if (closed > 0) extra.unshift(t("admin_trade_reports_siblings_closed", { n: formatAdminNumber(closed) }));
      if (json.postHidden === true && chosen !== "hide") extra.unshift(t("admin_trade_reports_post_also_hidden"));
      b = {
        tone: communityWarningsOf(json, language).length ? "warning" : "success",
        text: chosen ? t("admin_trade_reports_decided", { action: t(DECISION_TEXT[chosen].title) }) : t("admin_trade_reports_done"),
        extra,
      };
    }
    setSheetBanner(b);
    onDecided(b);
  };

  // 조치 확인 시트를 띄우는 동안 처리 시트는 잠시 내린다 (시트 겹침 방지)
  if (decision && report) {
    const rows = [
      { label: t("admin_trade_reports_reason"), value: tradeReportReasonLabel(t, s(report.reason_code)) },
      { label: t("admin_trade_audit_target"), value: post ? s(post.title) || t("admin_trade_posts_no_title") : tradeReportTargetLabel(t, s(report.target_type)) },
      { label: t("admin_trade_reports_section_target_member"), value: targetUser?.label?.trim() || (targetUser ? t("admin_trade_kit_no_name") : "—") },
    ];
    if (decision === "restrict") {
      rows.push({
        label: t("admin_trade_reports_restriction"),
        value: `${tradeRestrictionScopeLabel(t, scope)} · ${tradeRestrictionDaysLabel(t, days)}${hidePost ? ` · ${t("admin_trade_reports_also_hide_post")}` : ""}`,
      });
    } else if (decision === "warn" && hidePost) {
      rows.push({ label: t("admin_trade_reports_also_handle"), value: t("admin_trade_reports_also_hide_post") });
    }
    return (
      <CommunityActionSheet
        title={t(DECISION_TEXT[decision].title)}
        rows={rows}
        notice={t(DECISION_TEXT[decision].notice)}
        reason={{ minLength: REASON_MIN, placeholder: t("admin_trade_reports_reason_ph") }}
        ready={decision === "reject" || decision === "hide" || Boolean(targetUser)}
        destructive={decision === "hide" || decision === "restrict"}
        confirmLabel={t(DECISION_TEXT[decision].confirm)}
        onClose={() => setDecision(null)}
        onSubmit={async (reason) => {
          const body: Rec = { decision, reason };
          if (decision === "warn" || decision === "restrict") {
            body.hidePost = Boolean(post) && hidePost;
            if (targetUser) body.targetUserId = targetUser.id;
          }
          if (decision === "restrict") {
            body.restriction = scope;
            body.days = days === "perm" ? null : Number(days);
          }
          const { result, json } = await communityActionFetch(
            `/api/admin/trade/reports/${encodeURIComponent(reportId)}`,
            "POST",
            body
          );
          lastJson.current = json;
          return result;
        }}
        onSettled={settle}
      >
        {decision === "restrict" ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
              {t("admin_trade_reports_field_scope")}
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg"
              >
                {(["post", "chat", "all"] as const).map((v) => (
                  <option key={v} value={v}>
                    {tradeRestrictionScopeLabel(t, v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
              {t("admin_trade_reports_field_period")}
              <select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg"
              >
                {TRADE_RESTRICTION_DAY_SELECT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {(decision === "warn" || decision === "restrict") && post ? (
          <label className="flex items-center gap-2 text-[13px] text-sam-fg">
            <input type="checkbox" checked={hidePost} onChange={(e) => setHidePost(e.target.checked)} />
            {t("admin_trade_reports_also_hide_listing")}
          </label>
        ) : null}
      </CommunityActionSheet>
    );
  }

  /** 하단: 왼쪽 [닫기] · 오른쪽 처리 버튼 (숨김·제한은 해제할 수 있어 danger 아님 — 확인 시트·사유는 그대로) */
  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      <AdminActionButton variant="secondary" onClick={onClose}>
        {t("admin_trade_close")}
      </AdminActionButton>
      {report && open ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {targetUser ? (
            <Link
              href={tradeDetailHref(`/admin/trade/members/${encodeURIComponent(targetUser.id)}?tab=account`, returnTo)}
              className="self-center text-[13px] font-medium text-sam-primary underline"
            >
              {t("admin_trade_reports_suspend_in_member")}
            </Link>
          ) : null}
          <AdminActionButton variant="secondary" onClick={() => setDecision("reject")}>
            {t("admin_trade_reports_dismiss")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={!post}
            title={post ? undefined : t("admin_trade_reports_post_only")}
            onClick={() => setDecision("hide")}
          >
            {t("admin_trade_reports_hide_listing")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={!targetUser}
            onClick={() => {
              setHidePost(false);
              setDecision("warn");
            }}
          >
            {t("admin_trade_reports_warn")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={!targetUser}
            onClick={() => {
              setHidePost(false);
              setDecision("restrict");
            }}
          >
            {t("admin_trade_activity_restriction")}
          </AdminActionButton>
        </div>
      ) : null}
    </div>
  );

  return (
    <AdminFormSheet title={t("admin_trade_reports_sheet_title")} onClose={onClose} footer={footer} maxWidthClass="max-w-3xl">
      <div className="space-y-4" data-trade-report-detail={reportId}>
        <CommunityBannerView banner={sheetBanner} onClose={() => setSheetBanner(null)} />
        {state.status === "loading" && !state.data ? (
          <AdminLoadingState ko />
        ) : state.status === "error" ? (
          state.httpStatus === 404 ? (
            <AdminEmptyState ko message={t("admin_trade_reports_not_found")} />
          ) : (
            <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
          )
        ) : report ? (
          <>
            <CommunitySummaryCard
              rows={[
                { label: t("admin_trade_reports_received"), value: abs(report.created_at) },
                { label: t("admin_trade_th_status"), value: <TradeReportStatusBadge value={s(report.status)} /> },
                { label: t("admin_trade_audit_target_type"), value: tradeReportTargetLabel(t, s(report.target_type)) },
                { label: t("admin_trade_reports_reason"), value: tradeReportReasonLabel(t, s(report.reason_code)) },
                {
                  label: t("admin_trade_reports_reporter"),
                  value: (
                    <TradeMemberCell
                      userId={s(report.reporter_id) || null}
                      label={s(report.reporter_label) || null}
                      returnTo={returnTo}
                    />
                  ),
                },
                {
                  label: t("admin_trade_restrict_th_handle"),
                  value: report.resolved_at
                    ? `${s(report.resolved_by_label) || t("admin_trade_confirm_source_admin")} · ${abs(report.resolved_at)}`
                    : "—",
                },
              ]}
            />
            {s(report.reason_text) ? (
              <CommunitySection title={t("admin_trade_reports_section_content")}>
                <p className="whitespace-pre-wrap rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 text-[13px] text-sam-fg">
                  {s(report.reason_text)}
                </p>
              </CommunitySection>
            ) : null}
            {s(report.admin_note) ? (
              <CommunitySection title={t("admin_trade_reports_section_action_reason")}>
                <p className="whitespace-pre-wrap text-[13px] text-sam-muted">{s(report.admin_note)}</p>
              </CommunitySection>
            ) : null}

            {post ? (
              <CommunitySection title={t("admin_trade_reports_section_target_post")}>
                <div className="flex items-start gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                  <TradePostThumb post={post} size={64} />
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/admin/products/${encodeURIComponent(s(post.id))}`}
                      className="font-semibold text-sam-primary hover:underline"
                    >
                      {s(post.title) || t("admin_trade_posts_no_title")}
                    </Link>
                    <div className="flex flex-wrap gap-1">
                      <TradeStageBadge value={s(post.seller_listing_state)} />
                      <TradeVisibilityBadges
                        moderationState={s(post.moderation_state) || null}
                        ownerState={s(post.owner_state) || null}
                      />
                    </div>
                    <p className="sam-text-xxs text-sam-muted">{t("admin_trade_reports_registered_at", { time: abs(post.created_at) })}</p>
                  </div>
                </div>
              </CommunitySection>
            ) : report.target_type === "product" || report.target_type === "post" ? (
              <p className="text-[13px] text-sam-muted">{t("admin_trade_reports_post_deleted")}</p>
            ) : null}

            <CommunitySection title={t("admin_trade_reports_section_target_member")}>
              {targetUser ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px]">
                  <TradeMemberCell userId={targetUser.id} label={targetUser.label} returnTo={returnTo} />
                  <span className="text-sam-muted">{t("admin_trade_reports_account_action_hint")}</span>
                </div>
              ) : (
                <p className="text-[13px] text-sam-muted">{t("admin_trade_reports_member_unknown")}</p>
              )}
            </CommunitySection>

            {post ? (
              <CommunitySection title={t("admin_trade_reports_siblings_title", { n: (d?.siblings ?? []).length })}>
                {(d?.siblings ?? []).length === 0 ? (
                  <p className="text-[13px] text-sam-muted">{t("admin_trade_reports_no_other")}</p>
                ) : (
                  <ul className="space-y-1">
                    {(d?.siblings ?? []).map((x) => (
                      <li
                        key={s(x.id)}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-1.5 text-[13px]"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{tradeReportReasonLabel(t, s(x.reason_code))}</span>
                          <span className="ml-2 text-sam-muted">{s(x.reporter_label) || t("admin_trade_points_member")}</span>
                          {s(x.reason_text) ? (
                            <span className="block line-clamp-1 sam-text-xxs text-sam-muted">{s(x.reason_text)}</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <TradeReportStatusBadge value={s(x.status)} />
                          <span className="sam-text-xxs text-sam-muted">
                            <CommunityTimeCell iso={s(x.created_at) || null} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CommunitySection>
            ) : null}

            <CommunitySection title={t("admin_trade_reports_section_history")}>
              <CommunityTimeline
                emptyText={t("admin_trade_reports_history_empty")}
                items={(d?.actions ?? []).map((a) => ({
                  id: s(a.id),
                  at: s(a.created_at),
                  actor: s(a.actor_label) || t("admin_trade_confirm_source_admin"),
                  action: t(ACTION_LABEL[s(a.action_type)] ?? "admin_trade_restrict_th_handle"),
                  reason: s(a.action_note) || null,
                }))}
              />
            </CommunitySection>

            {targetUser ? (
              <CommunitySection title={t("admin_trade_reports_section_member_prior_actions")}>
                <CommunityTimeline
                  emptyText={t("admin_trade_reports_prior_empty")}
                  items={(d?.sanctions ?? []).map((x) => {
                    const st = tradeSanctionStatusOf(x);
                    const scopeText = x.restriction
                      ? ` · ${tradeRestrictionScopeLabel(t, s(x.restriction)) ?? t("admin_trade_restrict_scope_unknown")}`
                      : "";
                    const domain =
                      s(x.scope) === "trade" ? t("admin_trade") : s(x.scope) === "community" ? t("admin_trade_reports_domain_community") : "";
                    const period = s(x.sanction_type) === "warning" ? "" : ` · ${tradeSanctionPeriodText(t, x)}`;
                    const stKey: MessageKey =
                      st === "active"
                        ? "admin_trade_restrict_badge_active"
                        : st === "revoked"
                          ? "admin_trade_restrict_badge_revoked"
                          : "admin_trade_restrict_badge_expired";
                    const stText = s(x.sanction_type) === "warning" ? "" : ` (${t(stKey)})`;
                    return {
                      id: s(x.id),
                      at: s(x.created_at) || s(x.start_at),
                      actor: domain || t("admin_trade_confirm_source_admin"),
                      action: `${tradeSanctionKindLabel(t, s(x.sanction_type))}${scopeText}${period}${stText}`,
                      reason: s(x.reason) || null,
                    };
                  })}
                />
              </CommunitySection>
            ) : null}

            {!open ? <p className="text-[13px] text-sam-muted">{t("admin_trade_reports_already_handled")}</p> : null}

            <AdminTechDetails ko>
              <div>{t("admin_trade_reports_report_id", { id: reportId })}</div>
              {s(report.target_id) ? <div>{t("admin_trade_reports_target_id", { id: s(report.target_id) })}</div> : null}
            </AdminTechDetails>
          </>
        ) : null}
      </div>
    </AdminFormSheet>
  );
}

function abs(iso: unknown): string {
  return iso ? `${formatAdminManilaDateTime(String(iso))} PHT` : "—";
}

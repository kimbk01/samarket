"use client";

/**
 * 거래 신고 `/admin/trade/reports` (설계 v2 §C-4).
 * 탭: 처리 대기 / 처리 완료 / 반려 / 전체 (건수) · 필터: 대상 유형 · 접수 기간(PHT) · 특정 대상(?targetId=).
 * 행을 누르면 처리 시트 — 신고 내용·대상 글·대상 회원·같은 게시물 다른 신고·처리 기록·회원의 기존 조치.
 * 처리(반려·게시물 숨김·경고·거래 활동 제한)는 POST /api/admin/trade/reports/:id 한 번 (2단계 확인·사유).
 * 계정 정지·차단은 여기서 하지 않는다 — 판매자·구매자 상세의 계정 조치로 이동.
 * URL: tab · targetType · targetId · reporterId · sellerId · period/from/to · reportId · page · size(20/50/100)
 */
import Link from "next/link";
import { useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
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
  COMMUNITY_STALE_TEXT,
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
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  TRADE_RESTRICTION_DAY_SELECT,
  TRADE_RESTRICTION_SCOPE_LABEL,
  tradeSanctionKindLabel,
  tradeSanctionPeriodText,
  tradeSanctionStatusOf,
} from "@/components/admin/trade/restrictions/TradeRestrictionsPage";

const REASON_MIN = 2;

type Rec = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

type TabKey = "open" | "sanctioned" | "rejected" | "all";
const TABS: { value: TabKey; label: string }[] = [
  { value: "open", label: "처리 대기" },
  { value: "sanctioned", label: "처리 완료" },
  { value: "rejected", label: "반려" },
  { value: "all", label: "전체" },
];
const EMPTY_TEXT: Record<TabKey, string> = {
  open: "처리할 신고가 없습니다.",
  sanctioned: "처리 완료한 신고가 없습니다.",
  rejected: "반려한 신고가 없습니다.",
  all: "신고가 없습니다.",
};

const TARGET_OPTIONS = [
  { value: "", label: "전체 대상" },
  { value: "product", label: "거래글" },
  { value: "user", label: "회원" },
  { value: "chat_room", label: "채팅방" },
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

const STATUS_LABEL: Record<string, { label: string; tone: AdminTone }> = {
  pending: { label: "처리 대기", tone: "waiting" },
  reviewing: { label: "검토 중", tone: "progress" },
  sanctioned: { label: "처리 완료", tone: "success" },
  resolved: { label: "처리 완료", tone: "success" },
  reviewed: { label: "처리 완료", tone: "success" },
  rejected: { label: "반려", tone: "neutral" },
};

export function TradeReportStatusBadge({ value }: { value: string | null | undefined }) {
  const hit = STATUS_LABEL[s(value)];
  return <AdminToneBadge tone={hit?.tone ?? "neutral"}>{hit?.label ?? "알 수 없음"}</AdminToneBadge>;
}

export function isTradeReportOpen(status: string | null | undefined): boolean {
  return status === "pending" || status === "reviewing";
}

const EXTRA_REASON: Record<string, string> = {
  abusive_language: "욕설·비방",
  inappropriate_item: "판매 금지 물품",
};

/** 신고 사유 코드 → 한국어 (모르는 코드는 「기타」) */
export function tradeReportReasonLabel(code: string | null | undefined): string {
  const c = s(code).trim().toLowerCase();
  if (!c) return "사유 없음";
  if (EXTRA_REASON[c]) return EXTRA_REASON[c];
  const l = adminChatLabel("report_reason", c, true);
  return l.known ? l.label : "기타";
}

export function tradeReportTargetLabel(t: string | null | undefined): string {
  switch (s(t)) {
    case "product":
    case "post":
      return "거래글";
    case "user":
      return "회원";
    case "chat_room":
    case "chat":
      return "채팅방";
    case "chat_message":
      return "채팅 메시지";
    case "comment":
      return "댓글";
    default:
      return "기타";
  }
}

const ACTION_LABEL: Record<string, string> = {
  reject: "반려",
  product_hide: "게시물 숨김",
  warn: "경고",
  trade_restriction: "거래 활동 제한",
  chat_ban: "채팅 금지 (이전 방식)",
};

/* ───────── 목록 ───────── */

export function TradeReportsPage() {
  const qs = useCommunityQueryState();
  const tabRaw = qs.get("tab");
  const tab: TabKey = (TABS.find((t) => t.value === tabRaw)?.value ?? "open") as TabKey;
  const targetType = qs.get("targetType");
  const targetId = qs.get("targetId");
  const reporterId = qs.get("reporterId");
  const sellerId = qs.get("sellerId");
  const period = qs.get("period");
  const from = qs.get("from");
  const to = qs.get("to");
  const reportId = qs.get("reportId");
  const [banner, setBanner] = useState<CommunityBanner>(null);

  const params = new URLSearchParams({ tab, limit: String(qs.limitOffset.limit), offset: String(qs.limitOffset.offset) });
  if (targetType) params.set("targetType", targetType);
  if (targetId) params.set("targetId", targetId);
  if (reporterId) params.set("reporterId", reporterId);
  if (sellerId) params.set("sellerId", sellerId);
  params.set("period", period || "all");
  if (period === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  const customIncomplete = period === "custom" && (!from || !to);
  const { state, reload } = useCommunityAdminJson<ListResponse>(
    customIncomplete ? null : `/api/admin/trade/reports?${params.toString()}`
  );
  const rows = state.status === "ok" ? state.data.rows ?? [] : state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const counts = state.data?.tabCounts ?? {};

  const openDetail = (id: string) => qs.set({ reportId: id }, { keepPage: true });
  const closeDetail = () => qs.set({ reportId: null }, { keepPage: true });

  return (
    <CommunityListShell
      title="거래 신고"
      description="거래글·회원·거래 채팅 신고를 확인하고 반려하거나 게시물 숨김·경고·거래 활동 제한으로 처리합니다."
      actions={
        <AdminActionButton variant="secondary" onClick={reload}>
          새로고침
        </AdminActionButton>
      }
      banner={<CommunityBannerView banner={banner} onClose={() => setBanner(null)} />}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "open" ? null : v })}
          tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar showSearch={false} showPeriod resetKeep={["tab"]} onRefresh={reload} pending={state.status === "loading"}>
          <CommunityFilterField label="대상 유형">
            <CommunitySelect value={targetType} onChange={(v) => qs.set({ targetType: v })} options={TARGET_OPTIONS} />
          </CommunityFilterField>
          {targetId ? (
            <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-2 py-1 text-[12px] text-sam-fg">
              특정 대상만 보기
              <AdminActionButton
                variant="quiet"
                size="sm"
                className="!h-6 !px-1"
                aria-label="특정 대상 해제"
                onClick={() => qs.set({ targetId: null })}
              >
                ×
              </AdminActionButton>
            </span>
          ) : null}
          {sellerId ? (
            <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-2 py-1 text-[12px] text-sam-fg">
              특정 회원(본인·판매글) 신고만 보기
              <AdminActionButton
                variant="quiet"
                size="sm"
                className="!h-6 !px-1"
                aria-label="특정 회원 해제"
                onClick={() => qs.set({ sellerId: null })}
              >
                ×
              </AdminActionButton>
            </span>
          ) : null}
          {reporterId ? (
            <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-2 py-1 text-[12px] text-sam-fg">
              특정 신고자만 보기
              <AdminActionButton
                variant="quiet"
                size="sm"
                className="!h-6 !px-1"
                aria-label="특정 신고자 해제"
                onClick={() => qs.set({ reporterId: null })}
              >
                ×
              </AdminActionButton>
            </span>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination q={qs} total={total} disabled={state.status === "loading"} />}
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko
          message={EMPTY_TEXT[tab]}
          onReset={
            qs.hasAny(["targetType", "targetId", "reporterId", "sellerId", "period", "from", "to"]) ? () => qs.reset(["tab"]) : undefined
          }
        />
      ) : (
        <CommunityTable head={["접수", "대상", "신고 사유", "신고자", "상태", "처리자·처리 시각", "처리"]}>
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
                <ReportTargetCell row={r} returnTo={qs.selfHref} />
              </td>
              <td className={COMMUNITY_TD}>
                <span className="font-medium text-sam-fg">{tradeReportReasonLabel(r.reason_code)}</span>
                {r.reason_text ? (
                  <p className="line-clamp-2 max-w-[16rem] sam-text-xxs text-sam-muted">{r.reason_text}</p>
                ) : null}
              </td>
              <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
                <TradeMemberCell userId={r.reporter_id} label={r.reporter_label} returnTo={qs.selfHref} />
              </td>
              <td className={COMMUNITY_TD}>
                <TradeReportStatusBadge value={r.status} />
              </td>
              <td className={COMMUNITY_TD}>
                {r.resolved_at ? (
                  <span className="flex flex-col">
                    <span>{r.resolved_by_label ?? "관리자"}</span>
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
                  {isTradeReportOpen(r.status) ? "처리" : "보기"}
                </AdminActionButton>
              </td>
            </tr>
          ))}
        </CommunityTable>
      )}

      {reportId ? (
        <TradeReportDetailSheet
          reportId={reportId}
          returnTo={qs.selfHref}
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
  if (row.post) {
    return (
      <span className="flex items-start gap-2">
        <TradePostThumb post={row.post} size={40} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 max-w-[14rem] font-medium text-sam-fg">{row.post.title?.trim() || "제목 없음"}</span>
          <span className="sam-text-xxs text-sam-muted" onClick={(e) => e.stopPropagation()}>
            판매자 <TradeMemberCell userId={row.target_user_id} label={row.target_user_label} returnTo={returnTo} />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="sam-text-xxs text-sam-muted">{tradeReportTargetLabel(row.target_type)}</span>
      {row.target_user_id ? (
        <span onClick={(e) => e.stopPropagation()}>
          <TradeMemberCell userId={row.target_user_id} label={row.target_user_label} returnTo={returnTo} />
        </span>
      ) : row.target_type === "product" || row.target_type === "post" ? (
        <span className="text-sam-muted">삭제된 거래글</span>
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

const DECISION_TEXT: Record<Decision, { title: string; confirm: string; notice: string }> = {
  reject: {
    title: "신고 반려",
    confirm: "반려",
    notice: "조치 없이 신고를 닫습니다. 신고자에게 처리 완료 알림이 갑니다.",
  },
  hide: {
    title: "게시물 숨김",
    confirm: "게시물 숨김",
    notice: "거래글이 목록·검색에서 숨겨지고 판매자에게 알림이 갑니다. 같은 게시물의 다른 대기 신고도 함께 처리됩니다.",
  },
  warn: {
    title: "경고",
    confirm: "경고 보내기",
    notice: "회원에게 경고 알림이 갑니다. 거래 활동은 막히지 않습니다.",
  },
  restrict: {
    title: "거래 활동 제한",
    confirm: "거래 활동 제한",
    notice: "선택한 범위의 거래 활동이 기간 동안 막히고 회원에게 알림이 갑니다. 커뮤니티·배달은 그대로입니다.",
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
    if (kind === "stale") b = { tone: "warning", text: COMMUNITY_STALE_TEXT };
    else if (kind === "gone") b = { tone: "error", text: tradeErrorText("not_found") };
    else {
      const json = lastJson.current;
      const extra = communityWarningsOf(json);
      const closed = Number(json.closedSiblings ?? 0);
      if (closed > 0) extra.unshift(`같은 게시물 신고 ${formatAdminNumber(closed)}건 함께 처리했습니다.`);
      if (json.postHidden === true && chosen !== "hide") extra.unshift("게시물도 숨겼습니다.");
      b = {
        tone: communityWarningsOf(json).length ? "warning" : "success",
        text: chosen ? `${DECISION_TEXT[chosen].title} 처리했습니다.` : "처리했습니다.",
        extra,
      };
    }
    setSheetBanner(b);
    onDecided(b);
  };

  // 조치 확인 시트를 띄우는 동안 처리 시트는 잠시 내린다 (시트 겹침 방지)
  if (decision && report) {
    const rows = [
      { label: "신고 사유", value: tradeReportReasonLabel(s(report.reason_code)) },
      { label: "대상", value: post ? s(post.title) || "제목 없음" : tradeReportTargetLabel(s(report.target_type)) },
      { label: "대상 회원", value: targetUser?.label?.trim() || (targetUser ? "이름 없음" : "—") },
    ];
    if (decision === "restrict") {
      rows.push({
        label: "제한",
        value: `${TRADE_RESTRICTION_SCOPE_LABEL[scope]} · ${days === "perm" ? "영구" : `${days}일`}${hidePost ? " · 게시물도 숨김" : ""}`,
      });
    } else if (decision === "warn" && hidePost) {
      rows.push({ label: "함께 처리", value: "게시물도 숨김" });
    }
    return (
      <CommunityActionSheet
        title={DECISION_TEXT[decision].title}
        rows={rows}
        notice={DECISION_TEXT[decision].notice}
        reason={{ minLength: REASON_MIN, placeholder: "처리 사유 (운영 기록·회원 알림에 남습니다)" }}
        ready={decision === "reject" || decision === "hide" || Boolean(targetUser)}
        destructive={decision === "hide" || decision === "restrict"}
        confirmLabel={DECISION_TEXT[decision].confirm}
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
              범위
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg"
              >
                {(["post", "chat", "all"] as const).map((v) => (
                  <option key={v} value={v}>
                    {TRADE_RESTRICTION_SCOPE_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
              기간
              <select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg"
              >
                {TRADE_RESTRICTION_DAY_SELECT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {(decision === "warn" || decision === "restrict") && post ? (
          <label className="flex items-center gap-2 text-[13px] text-sam-fg">
            <input type="checkbox" checked={hidePost} onChange={(e) => setHidePost(e.target.checked)} />
            게시물도 숨김
          </label>
        ) : null}
      </CommunityActionSheet>
    );
  }

  const footer =
    report && open ? (
      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" onClick={() => setDecision("reject")}>
          반려
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled={!post} title={post ? undefined : "거래글 신고에서만 할 수 있습니다"} onClick={() => setDecision("hide")}>
          게시물 숨김
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={!targetUser}
          onClick={() => {
            setHidePost(false);
            setDecision("warn");
          }}
        >
          경고
        </AdminActionButton>
        <AdminActionButton
          variant="danger"
          disabled={!targetUser}
          onClick={() => {
            setHidePost(false);
            setDecision("restrict");
          }}
        >
          거래 활동 제한
        </AdminActionButton>
        {targetUser ? (
          <Link
            href={tradeDetailHref(`/admin/trade/members/${encodeURIComponent(targetUser.id)}?tab=account`, returnTo)}
            className="ml-auto self-center text-[13px] font-medium text-sam-primary underline"
          >
            계정 정지는 회원 화면에서
          </Link>
        ) : null}
      </div>
    ) : (
      <div className="flex justify-end">
        <AdminActionButton variant="secondary" onClick={onClose}>
          닫기
        </AdminActionButton>
      </div>
    );

  return (
    <AdminFormSheet title="거래 신고 처리" onClose={onClose} footer={footer} maxWidthClass="max-w-3xl">
      <div className="space-y-4" data-trade-report-detail={reportId}>
        <CommunityBannerView banner={sheetBanner} onClose={() => setSheetBanner(null)} />
        {state.status === "loading" && !state.data ? (
          <AdminLoadingState ko />
        ) : state.status === "error" ? (
          state.httpStatus === 404 ? (
            <AdminEmptyState ko message="신고를 찾을 수 없습니다." />
          ) : (
            <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
          )
        ) : report ? (
          <>
            <CommunitySummaryCard
              rows={[
                { label: "접수", value: abs(report.created_at) },
                { label: "상태", value: <TradeReportStatusBadge value={s(report.status)} /> },
                { label: "대상 유형", value: tradeReportTargetLabel(s(report.target_type)) },
                { label: "신고 사유", value: tradeReportReasonLabel(s(report.reason_code)) },
                {
                  label: "신고자",
                  value: (
                    <TradeMemberCell
                      userId={s(report.reporter_id) || null}
                      label={s(report.reporter_label) || null}
                      returnTo={returnTo}
                    />
                  ),
                },
                {
                  label: "처리",
                  value: report.resolved_at
                    ? `${s(report.resolved_by_label) || "관리자"} · ${abs(report.resolved_at)}`
                    : "—",
                },
              ]}
            />
            {s(report.reason_text) ? (
              <CommunitySection title="신고 내용">
                <p className="whitespace-pre-wrap rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 text-[13px] text-sam-fg">
                  {s(report.reason_text)}
                </p>
              </CommunitySection>
            ) : null}
            {s(report.admin_note) ? (
              <CommunitySection title="처리 사유">
                <p className="whitespace-pre-wrap text-[13px] text-sam-muted">{s(report.admin_note)}</p>
              </CommunitySection>
            ) : null}

            {post ? (
              <CommunitySection title="대상 거래글">
                <div className="flex items-start gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                  <TradePostThumb post={post} size={64} />
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/admin/products/${encodeURIComponent(s(post.id))}`}
                      className="font-semibold text-sam-primary hover:underline"
                    >
                      {s(post.title) || "제목 없음"}
                    </Link>
                    <div className="flex flex-wrap gap-1">
                      <TradeStageBadge value={s(post.seller_listing_state)} />
                      <TradeVisibilityBadges
                        moderationState={s(post.moderation_state) || null}
                        ownerState={s(post.owner_state) || null}
                      />
                    </div>
                    <p className="sam-text-xxs text-sam-muted">등록 {abs(post.created_at)}</p>
                  </div>
                </div>
              </CommunitySection>
            ) : report.target_type === "product" || report.target_type === "post" ? (
              <p className="text-[13px] text-sam-muted">대상 거래글이 삭제되어 확인할 수 없습니다.</p>
            ) : null}

            <CommunitySection title="대상 회원">
              {targetUser ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px]">
                  <TradeMemberCell userId={targetUser.id} label={targetUser.label} returnTo={returnTo} />
                  <span className="text-sam-muted">계정 정지·차단은 회원 상세의 계정 조치에서 합니다.</span>
                </div>
              ) : (
                <p className="text-[13px] text-sam-muted">대상 회원을 확인할 수 없습니다.</p>
              )}
            </CommunitySection>

            {post ? (
              <CommunitySection title={`같은 게시물 다른 신고 (${(d?.siblings ?? []).length}건)`}>
                {(d?.siblings ?? []).length === 0 ? (
                  <p className="text-[13px] text-sam-muted">다른 신고가 없습니다.</p>
                ) : (
                  <ul className="space-y-1">
                    {(d?.siblings ?? []).map((x) => (
                      <li
                        key={s(x.id)}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-1.5 text-[13px]"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{tradeReportReasonLabel(s(x.reason_code))}</span>
                          <span className="ml-2 text-sam-muted">{s(x.reporter_label) || "회원"}</span>
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

            <CommunitySection title="처리 기록">
              <CommunityTimeline
                emptyText="처리 기록이 없습니다."
                items={(d?.actions ?? []).map((a) => ({
                  id: s(a.id),
                  at: s(a.created_at),
                  actor: s(a.actor_label) || "관리자",
                  action: ACTION_LABEL[s(a.action_type)] ?? "처리",
                  reason: s(a.action_note) || null,
                }))}
              />
            </CommunitySection>

            {targetUser ? (
              <CommunitySection title="대상 회원의 기존 조치">
                <CommunityTimeline
                  emptyText="기존 경고·제한이 없습니다."
                  items={(d?.sanctions ?? []).map((x) => {
                    const st = tradeSanctionStatusOf(x);
                    const scopeText = x.restriction ? ` · ${TRADE_RESTRICTION_SCOPE_LABEL[s(x.restriction)] ?? "범위 확인 불가"}` : "";
                    const domain = s(x.scope) === "trade" ? "거래" : s(x.scope) === "community" ? "커뮤니티" : "";
                    const period = s(x.sanction_type) === "warning" ? "" : ` · ${tradeSanctionPeriodText(x)}`;
                    const stText =
                      s(x.sanction_type) === "warning" ? "" : st === "active" ? " (진행 중)" : st === "revoked" ? " (해제)" : " (만료)";
                    return {
                      id: s(x.id),
                      at: s(x.created_at) || s(x.start_at),
                      actor: domain || "관리자",
                      action: `${tradeSanctionKindLabel(s(x.sanction_type))}${scopeText}${period}${stText}`,
                      reason: s(x.reason) || null,
                    };
                  })}
                />
              </CommunitySection>
            ) : null}

            {!open ? <p className="text-[13px] text-sam-muted">이미 처리된 신고입니다.</p> : null}

            <AdminTechDetails ko>
              <div>신고 ID: {reportId}</div>
              {s(report.target_id) ? <div>대상 ID: {s(report.target_id)}</div> : null}
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

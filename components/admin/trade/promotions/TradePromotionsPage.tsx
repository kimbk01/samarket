"use client";

/**
 * 거래 상위노출 (설계 v2 §G-1 · 재감사 R3 P-6 「광고」 용어) — 거래 글 상위노출 주문의 승인·반려·일시 중지·재개·종료.
 * 종료: 책임 구분 선택 → 환급 미리보기(변경 없음) → 공개 사유(+ 내부 메모) → 2단계 확인 (대상 재입력 없음 · 어드민 SSOT §3-1).
 * 승인도 사유 필수(AD2-01) · 정지·재개·종료는 공개 사유 + 내부 메모 두 칸(D-10) · 삭제는 공용 `AdminAdDeleteAction`(사유만).
 * URL: tab(탭 — 대시보드 딥링크) · userId · postId · from/to(PHT) · (호환) period · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { LISTING_END_LABEL_KEYS, LISTING_PAUSE_LABEL_KEYS } from "@/lib/admin/trade-admin/trade-promotion-labels";
import { useEffect, useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunitySheetResult,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import {
  TradeMemberCell,
  TradePostThumb,
  formatTradePoints,
  tradeDetailHref,
  tradeErrorText,
} from "@/components/admin/trade/kit/TradeAdminKit";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { adsWorkspaceActionSplitsReason } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { AdsInternalMemoField } from "@/components/admin/community/kit/AdsInternalMemoField";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";
import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** D-10 — 내부 메모가 있으면 `internalReason` 으로 보낸다(회원 응답·알림에 나가지 않음). */
function withInternalMemo(body: Record<string, unknown>, memo: string): Record<string, unknown> {
  const m = memo.trim();
  return m ? { ...body, internalReason: m } : body;
}

const LIST_EXTRAS = ["userId", "postId"] as const;
const TABS = ["pending_review", "active", "paused", "ended", "rejected", "all"] as const;
const TAB_LABELS: Record<string, MessageKey> = {
  pending_review: "admin_trade_promo_st_pending",
  active: "admin_trade_promo_st_active",
  paused: "admin_trade_promo_st_paused",
  ended: "admin_trade_promo_st_ended",
  rejected: "admin_trade_promo_tab_rejected",
  all: "common_all",
};

const STATUS: Record<string, { labelKey: MessageKey; tone: AdminTone }> = {
  pending_review: { labelKey: "admin_trade_promo_st_pending", tone: "waiting" },
  active: { labelKey: "admin_trade_promo_st_active", tone: "success" },
  paused: { labelKey: "admin_trade_promo_st_paused", tone: "warning" },
  ended: { labelKey: "admin_trade_promo_st_ended", tone: "neutral" },
  expired: { labelKey: "admin_trade_promo_st_expired", tone: "neutral" },
  rejected: { labelKey: "admin_trade_promo_st_rejected", tone: "danger" },
  cancelled: { labelKey: "admin_trade_promo_st_cancelled", tone: "neutral" },
};

const FAULT_LABELS: Record<string, MessageKey> = {
  operator: "admin_trade_promo_fault_operator",
  member: "admin_trade_promo_fault_member",
  none: "admin_trade_promo_fault_none",
};

type Row = {
  id: string;
  user_id: string | null;
  user_label: string | null;
  target_id: string | null;
  target_title: string | null;
  post: { title?: string | null; thumbnail_url?: unknown; images?: unknown } | null;
  placement: string | null;
  duration_days: number | null;
  point_cost: number | null;
  order_status: string;
  overdue: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
  ended_at: string | null;
  ended_by_label: string | null;
  fault: string | null;
  refund_points: number | null;
  review_reason: string | null;
  paused_by?: string | null;
  end_reason_code?: string | null;
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  tabCounts?: Record<string, number | null>;
  rows?: Row[];
};

type ActionKind = "approve" | "reject" | "pause" | "resume" | "end";
type Sheet = { kind: ActionKind; row: Row } | null;

const shortDate = (iso: string | null | undefined) => (iso ? formatAdminManilaDateTime(iso).slice(5, 16) : "—");
const titleOf = (t: Translate, r: Row) => r.post?.title || r.target_title || t("admin_trade_audit_target_post");

/** POST 실행 — sideEffectWarning·환급 포인트를 함께 돌려받는다 */
async function postAction(
  id: string,
  body: Record<string, unknown>
): Promise<{ result: CommunitySheetResult; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/admin/trade/promotions/${encodeURIComponent(id)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok !== false) {
      // B-20: 처리 성공 즉시 관리자 종·사이드바 숫자 갱신(폴링 대기 제거). 미리보기는 상태 변화 없음.
      if (body.preview !== true) emitAdminQueueChanged("trade_promo_pending");
      return { result: { ok: true }, json };
    }
    const code = String(json.error || `http_${res.status}`);
    /** 재감사 B-7: 글 상태 거절은 운영자 문구로 */
    return {
      result: { ok: false, status: res.status, code: code === "listing_unavailable" || code === "listing_paused" ? tradeErrorText(code) : code },
      json,
    };
  } catch {
    return { result: { ok: false, status: 0, code: "network_error" }, json: {} };
  }
}

export function TradePromotionsPage() {
  const { t } = useI18n();
  /** `tab` 은 조회 조건 밖 키 — [초기화] 후에도 유지, 탭을 바꾸면 1쪽으로 */
  const q = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: LIST_EXTRAS });
  const tab = (TABS as readonly string[]).includes(q.get("tab")) ? q.get("tab") : "pending_review";
  const { userId, postId } = lq.query.extras;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const [warning, setWarning] = useState(false);
  /** 권한 표 §4: 거래 상위노출 쓰기 = ads (API `requireAdsWriteAdmin` 과 같은 접근표 판정) */
  const writeGuard = useAdminWriteGuard("/admin/trade/promotions");

  const params = lq.apiParams();
  params.set("tab", tab);
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/trade/promotions?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const counts = state.data?.tabCounts ?? {};
  const memberName = userId ? rows.find((r) => r.user_id === userId)?.user_label : null;
  const postName = postId ? rows.find((r) => r.target_id === postId) : null;

  const settle = (k: CommunitySheetSettle, okMessage: string, sideEffectWarning: boolean) => {
    setSheet(null);
    reload();
    setWarning(k === "done" && sideEffectWarning);
    setBanner({ ok: true, message: k === "done" ? okMessage : k === "stale" ? t("admin_community_post_stale") : t("admin_community_list_gone") });
  };

  return (
    <CommunityListShell
      title={t("admin_trade_promo_page_title")}
      description={t("admin_trade_promo_desc")}
      banner={
        <div className="space-y-1">
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
          {warning ? (
            <p className="text-[12px] text-sam-warning">{t("admin_trade_promo_notify_failed")}</p>
          ) : null}
        </div>
      }
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => q.set({ tab: v === "pending_review" ? null : v })}
          tabs={TABS.map((x) => ({ value: x, label: t(TAB_LABELS[x]), count: counts[x] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showSearch={false} pending={state.status === "loading"}>
          {userId ? (
            <CommunityFilterField label={t("admin_trade_promo_applicant")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {memberName || t("admin_trade_audit_selected_member")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("userId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {postId ? (
            <CommunityFilterField label={t("admin_trade_audit_post")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {postName ? titleOf(t, postName) : t("admin_trade_audit_selected_post")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("postId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={lq} onRetry={reload} emptyMessage={t("admin_trade_promo_empty")}>
        <CommunityTable head={[t("admin_trade_audit_post"), t("admin_trade_promo_applicant"), t("admin_trade_post_ads_th_period"), t("admin_trade_th_points"), t("admin_trade_th_status"), t("admin_trade_points_entry_refund"), t("admin_trade_restrict_th_handle")]}>
          {rows.map((r) => {
            const st = STATUS[r.order_status] ?? { labelKey: "common_need_check" as MessageKey, tone: "neutral" as AdminTone };
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  <div className="flex items-start gap-2">
                    <TradePostThumb post={r.post ?? {}} size={40} />
                    <div className="min-w-0">
                      {r.target_id ? (
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.target_id)}`, lq.selfHref)}
                          className="font-medium text-sam-primary hover:underline [overflow-wrap:anywhere]"
                        >
                          {titleOf(t, r)}
                        </Link>
                      ) : (
                        titleOf(t, r)
                      )}
                      {!r.post && r.target_id ? (
                        <div className="text-[12px] text-sam-muted">{t("admin_trade_promo_post_not_found")}</div>
                      ) : null}
                      {r.target_id && !postId ? (
                        <AdminActionButton
                          variant="quiet"
                          size="sm"
                          className="!h-auto !px-0 text-left text-[12px] font-normal"
                          onClick={() => lq.setExtra("postId", r.target_id ?? "")}
                        >
                          {t("admin_trade_this_post_only")}
                        </AdminActionButton>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className={COMMUNITY_TD}>
                  <TradeMemberCell userId={r.user_id} label={r.user_label} returnTo={lq.selfHref} />
                  {r.user_id && !userId ? (
                    <AdminActionButton
                      variant="quiet"
                      size="sm"
                      className="!h-auto !px-0 text-left text-[12px] font-normal"
                      onClick={() => lq.setExtra("userId", r.user_id ?? "")}
                    >
                      {t("admin_trade_this_member_only")}
                    </AdminActionButton>
                  ) : null}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                  {t("admin_trade_promo_duration_days", { n: r.duration_days ?? "—" })}
                  <div className="text-[12px] text-sam-muted">
                    {r.start_at ? `${shortDate(r.start_at)} ~ ${shortDate(r.end_at)}` : t("admin_trade_promo_requested_at", { date: shortDate(r.created_at) })}
                  </div>
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.point_cost)}</td>
                <td className={COMMUNITY_TD}>
                  <span className="flex flex-wrap gap-1">
                    <AdminToneBadge tone={st.tone}>{t(st.labelKey)}</AdminToneBadge>
                    {r.overdue ? <AdminToneBadge tone="danger">{t("admin_trade_promo_overdue_badge")}</AdminToneBadge> : null}
                  </span>
                  {r.order_status === "paused" && r.paused_by && LISTING_PAUSE_LABEL_KEYS[r.paused_by] ? (
                    <div className="mt-1 text-[12px] text-sam-muted">
                      {t(LISTING_PAUSE_LABEL_KEYS[r.paused_by])} · {t("admin_trade_promo_paused_auto_resume_hint")}
                    </div>
                  ) : r.order_status === "paused" ? (
                    // 재감사 R3 (P-7 정정): 일시 중지 동안 기간이 흐르지 않는다 — 재개하면 멈춘 시간만큼 종료일이 뒤로 간다
                    // (운영 `admin_trade_promotion_resume`: end_at += 멈춘 시간). 그래서 「기간 만료」로 표시하지 않는다.
                    <div className="mt-1 text-[12px] text-sam-muted">{t("admin_trade_promo_paused_note")}</div>
                  ) : null}
                  {r.end_reason_code && LISTING_END_LABEL_KEYS[r.end_reason_code] ? (
                    <div className="mt-1 text-[12px] text-sam-muted">{t(LISTING_END_LABEL_KEYS[r.end_reason_code])}</div>
                  ) : null}
                  {r.review_reason ? (
                    <div className="mt-1 max-w-[14rem] text-[12px] text-sam-muted [overflow-wrap:anywhere]">{t("admin_trade_promo_reason", { reason: r.review_reason })}</div>
                  ) : null}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                  {typeof r.refund_points === "number" && r.refund_points > 0
                    ? formatTradePoints(r.refund_points)
                    : r.order_status === "ended" && r.fault
                      ? t("common_none")
                      : "—"}
                  {r.fault ? <div className="text-[12px] text-sam-muted">{FAULT_LABELS[r.fault] ? t(FAULT_LABELS[r.fault]) : r.fault}</div> : null}
                  {r.ended_by_label ? <div className="text-[12px] text-sam-muted">{t("admin_trade_promo_handled_by", { name: r.ended_by_label })}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <RowActions row={r} onPick={(kind) => { if (writeGuard.guard()) setSheet({ kind, row: r }); }} />
                  <div className="mt-1">
                    <AdminAdDeleteAction
                      kind="trade_promotion"
                      id={r.id}
                      title={titleOf(t, r)}
                      size="sm"
                      onDone={() => {
                        emitAdminQueueChanged("trade_promo_pending");
                        void reload();
                      }}
                    />
                  </div>
                  <AdminTechDetails ko>
                    <div>order: {r.id}</div>
                    {r.placement ? <div>placement: {r.placement}</div> : null}
                  </AdminTechDetails>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>

      {sheet && sheet.kind === "approve" ? (
        <ApproveSheet row={sheet.row} onClose={() => setSheet(null)} onSettled={settle} />
      ) : null}
      {sheet && (sheet.kind === "reject" || sheet.kind === "pause" || sheet.kind === "resume") ? (
        <ReasonActionSheet kind={sheet.kind} row={sheet.row} onClose={() => setSheet(null)} onSettled={settle} />
      ) : null}
      {sheet && sheet.kind === "end" ? <EndSheet row={sheet.row} onClose={() => setSheet(null)} onSettled={settle} /> : null}
    </CommunityListShell>
  );
}

/** 행 버튼 — ghost/sm 2개 이하 (각 조치는 확인 시트에서 2단계 확인) */
function RowActions({ row, onPick }: { row: Row; onPick: (k: ActionKind) => void }) {
  const { t } = useI18n();
  if (row.order_status === "pending_review") {
    return (
      <div className="flex flex-wrap gap-1">
        <AdminActionButton variant="secondary" size="sm" onClick={() => onPick("approve")}>
          {t("admin_trade_promotions_approve")}
        </AdminActionButton>
        <AdminActionButton variant="danger" size="sm" onClick={() => onPick("reject")}>
          {t("admin_trade_promotions_reject")}
        </AdminActionButton>
      </div>
    );
  }
  if (row.order_status === "active" || row.order_status === "paused") {
    return (
      <div className="flex flex-wrap gap-1">
        {row.order_status === "active" ? (
          <AdminActionButton variant="secondary" size="sm" onClick={() => onPick("pause")}>
            {t("admin_trade_promotions_pause")}
          </AdminActionButton>
        ) : String(row.paused_by ?? "").startsWith("listing_") ? null : (
          <AdminActionButton variant="secondary" size="sm" onClick={() => onPick("resume")}>
            {t("admin_trade_promotions_resume")}
          </AdminActionButton>
        )}
        <AdminActionButton variant="danger" size="sm" onClick={() => onPick("end")}>
          {t("admin_trade_promotions_end")}
        </AdminActionButton>
      </div>
    );
  }
  return <span className="text-sam-muted">—</span>;
}

function orderRows(t: Translate, r: Row) {
  const days = r.duration_days ?? "—";
  return [
    { label: t("admin_trade_audit_post"), value: titleOf(t, r) },
    { label: t("admin_trade_promo_applicant"), value: r.user_label || "—" },
    {
      label: t("admin_trade_post_ads_th_period"),
      value: r.start_at
        ? t("admin_trade_promo_period_range", { days, start: shortDate(r.start_at), end: shortDate(r.end_at) })
        : t("admin_trade_restrict_days_n", { n: days }),
    },
    { label: t("admin_trade_th_points"), value: formatTradePoints(r.point_cost) },
    { label: t("admin_trade_th_status"), value: t(STATUS[r.order_status]?.labelKey ?? "common_need_check") },
  ];
}

type SettleFn = (k: CommunitySheetSettle, okMessage: string, sideEffectWarning: boolean) => void;

/** 승인 — 사유 필수 2단계 확인 (AD2-01 · 공통 화면과 같은 L2) */
function ApproveSheet({ row, onClose, onSettled }: { row: Row; onClose: () => void; onSettled: SettleFn }) {
  const { t } = useI18n();
  const warn = useRef(false);
  const waiting = useRef(false);
  return (
    <CommunityActionSheet
      title={t("admin_trade_promo_approve_title")}
      rows={orderRows(t, row)}
      notice={t("admin_trade_promo_approve_notice")}
      reason={{ minLength: 2, placeholder: t("admin_trade_promo_approve_reason_ph") }}
      confirmLabel={t("admin_trade_promo_approve_btn")}
      onSubmit={async (reason) => {
        const { result, json } = await postAction(row.id, { action: "approve", reason });
        warn.current = json.sideEffectWarning === true;
        waiting.current = json.waiting === "listing";
        return result;
      }}
      onClose={onClose}
      onSettled={(k) =>
        onSettled(
          k,
          waiting.current
            ? t("admin_trade_promo_approved_waiting")
            : t("admin_trade_promo_approved"),
          warn.current
        )
      }
    />
  );
}

const REASON_ACTION: Record<
  "reject" | "pause" | "resume",
  { title: MessageKey; confirm: MessageKey; notice: MessageKey; ok: MessageKey; placeholder: MessageKey; destructive?: boolean }
> = {
  reject: {
    title: "admin_trade_audit_act_promo_reject",
    confirm: "admin_trade_promo_st_rejected_btn",
    notice: "admin_trade_promo_reject_notice",
    ok: "admin_trade_promo_rejected_ok",
    placeholder: "admin_trade_promo_reject_reason_ph",
    destructive: true,
  },
  pause: {
    title: "admin_trade_audit_act_promo_pause",
    confirm: "admin_trade_promo_pause_btn",
    notice: "admin_trade_promo_pause_notice",
    ok: "admin_trade_promo_paused_ok",
    placeholder: "admin_trade_promo_pause_reason_ph",
  },
  resume: {
    title: "admin_trade_audit_act_promo_resume",
    confirm: "admin_trade_promo_resume_btn",
    notice: "admin_trade_promo_resume_notice",
    ok: "admin_trade_promo_resumed_ok",
    placeholder: "admin_trade_promo_resume_reason_ph",
  },
};

function ReasonActionSheet({
  kind,
  row,
  onClose,
  onSettled,
}: {
  kind: "reject" | "pause" | "resume";
  row: Row;
  onClose: () => void;
  onSettled: SettleFn;
}) {
  const { t } = useI18n();
  const cfg = REASON_ACTION[kind];
  const warn = useRef(false);
  const [memo, setMemo] = useState("");
  const split = adsWorkspaceActionSplitsReason(kind);
  /** 재감사 B-3: 재개 결과 — 글 숨김 대기 · 글 판매완료·삭제로 종료 */
  const outcome = useRef<"waiting" | "ended" | null>(null);
  return (
    <CommunityActionSheet
      title={t(cfg.title)}
      rows={orderRows(t, row)}
      notice={t(cfg.notice)}
      reason={{ minLength: 2, placeholder: t(cfg.placeholder) }}
      destructive={cfg.destructive}
      confirmLabel={t(cfg.confirm)}
      onSubmit={async (reason) => {
        const { result, json } = await postAction(row.id, withInternalMemo({ action: kind, reason }, split ? memo : ""));
        warn.current = json.sideEffectWarning === true;
        outcome.current = json.waiting === "listing" ? "waiting" : kind === "resume" && json.order_status === "ended" ? "ended" : null;
        return result;
      }}
      onClose={onClose}
      onSettled={(k) =>
        onSettled(
          k,
          outcome.current === "waiting"
            ? t("admin_trade_promo_resume_waiting")
            : outcome.current === "ended"
              ? t("admin_trade_promo_resume_ended")
              : t(cfg.ok),
          warn.current
        )
      }
    >
      {split ? <AdsInternalMemoField value={memo} onChange={setMemo} /> : null}
    </CommunityActionSheet>
  );
}

type Preview = { refund: number; paid: number | null; remainingSeconds: number | null };

/** 종료 — 책임 구분을 고르면 미리보기(변경 없음)로 환급 예정 포인트를 먼저 보여 준다 */
function EndSheet({ row, onClose, onSettled }: { row: Row; onClose: () => void; onSettled: SettleFn }) {
  const { t } = useI18n();
  const [fault, setFault] = useState<"operator" | "member" | "none" | null>(null);
  const [preview, setPreview] = useState<{ fault: string; data: Preview } | { fault: string; error: string } | null>(null);
  const done = useRef({ refund: 0, warn: false });
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!fault) return;
    let alive = true;
    void (async () => {
      const { result, json } = await postAction(row.id, { action: "end", fault, preview: true });
      if (!alive) return;
      if (!result.ok) {
        setPreview({ fault, error: result.code });
        return;
      }
      setPreview({
        fault,
        data: {
          refund: Number(json.refund_points ?? 0) || 0,
          paid: typeof json.paid_points === "number" ? json.paid_points : null,
          remainingSeconds: typeof json.remaining_seconds === "number" ? json.remaining_seconds : null,
        },
      });
    })();
    return () => {
      alive = false;
    };
  }, [fault, row.id]);

  const current = preview && preview.fault === fault ? preview : null;
  const ready = Boolean(current && "data" in current);
  const remainDays =
    current && "data" in current && current.data.remainingSeconds !== null
      ? Math.max(0, Math.ceil(current.data.remainingSeconds / 86_400))
      : null;

  /**
   * 어드민 SSOT §3-1 (Owner 2026-11-07 · AD-123 대체): 종료 = L3 — 공개 사유 + 내부 메모 + 귀책 + 환급 미리보기.
   * 대상 재입력은 없다(귀책·환급 미리보기가 실수를 막는다).
   */

  return (
    <CommunityActionSheet
      title={t("admin_trade_promo_end_title")}
      rows={[
        ...orderRows(t, row),
        ...(current && "data" in current
          ? [{ label: t("admin_trade_promo_refund_expected"), value: <strong>{formatTradePoints(current.data.refund)}</strong> }]
          : []),
      ]}
      notice={t("admin_trade_promo_end_notice")}
      reason={{ minLength: 2, placeholder: t("admin_trade_promo_end_reason_ph") }}
      ready={ready}
      destructive
      confirmLabel={t("admin_trade_post_ads_end")}
      onSubmit={async (reason) => {
        const { result, json } = await postAction(
          row.id,
          withInternalMemo({ action: "end", fault, reason }, adsWorkspaceActionSplitsReason("end") ? memo : "")
        );
        done.current = { refund: Number(json.refund_points ?? 0) || 0, warn: json.sideEffectWarning === true };
        return result;
      }}
      onClose={onClose}
      onSettled={(k) =>
        onSettled(
          k,
          done.current.refund > 0
            ? t("admin_trade_promo_ended_refund", { n: formatAdminNumber(done.current.refund) })
            : t("admin_trade_promo_ended_no_refund"),
          done.current.warn
        )
      }
    >
      <fieldset className="space-y-2">
        <legend className="sam-text-helper font-medium text-sam-fg">{t("admin_trade_promo_fault_legend")}</legend>
        {(
          [
            ["operator", "admin_trade_promo_fault_operator", "admin_trade_promo_fault_operator_hint"],
            ["member", "admin_trade_promo_fault_member", "admin_trade_promo_no_refund_hint"],
            ["none", "admin_trade_promo_fault_none", "admin_trade_promo_no_refund_hint"],
          ] as const
        ).map(([v, labelKey, hintKey]) => (
          <label key={v} className="flex items-start gap-2 text-[13px]">
            <input type="radio" name="fault" checked={fault === v} onChange={() => setFault(v)} className="mt-0.5" />
            <span>
              <span className="font-medium text-sam-fg">{t(labelKey)}</span>
              <span className="block text-sam-muted">{t(hintKey)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {fault && !current ? <p className="text-[13px] text-sam-muted">{t("admin_trade_promo_refund_calculating")}</p> : null}
      {current && "data" in current ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] font-semibold text-sam-fg">
          {t("admin_trade_promo_refund_expected_amount", { amount: formatTradePoints(current.data.refund) })}
          {current.data.paid !== null || remainDays !== null ? (
            <span className="block font-normal text-sam-muted">
              {current.data.paid !== null ? t("admin_trade_promo_paid", { points: formatTradePoints(current.data.paid) }) : ""}
              {current.data.paid !== null && remainDays !== null ? " · " : ""}
              {remainDays !== null ? t("admin_trade_promo_remaining_days", { n: remainDays }) : ""}
            </span>
          ) : null}
        </p>
      ) : null}
      {current && "error" in current ? (
        <p role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-[13px] text-sam-fg">
          {tradeErrorText(current.error)}
        </p>
      ) : null}
      {adsWorkspaceActionSplitsReason("end") ? <AdsInternalMemoField value={memo} onChange={setMemo} /> : null}
    </CommunityActionSheet>
  );
}

/** 시험용 — 종료 시트 단독 렌더 (대상 재입력 없음) */
export { EndSheet as TradePromotionEndSheet };

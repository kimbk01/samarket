"use client";

/**
 * Commission ledger table + order detail panel — ONE component for Admin and Owner.
 * Admin injects the decision CTA (`renderAction`); Owner renders the same rows read-only.
 * Row tone = what the operator must know at a glance (review / approved / rejected / ledger anomaly);
 * every tone is also spelled out as a badge, never colour alone.
 */
import {
  commissionOrderStatusLabel,
  commissionOrderStatusLine,
  commissionOwnerRefundedLabel,
  commissionPolicyScopeLabel,
} from "@/lib/stores/commission/store-commission-display-labels";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatCashPhp2 } from "@/lib/currency/currency-display-contract";
import { STORE_COMMISSION_DECISION_LABEL } from "@/lib/stores/commission/store-commission-contract";
import type { StoreCommissionLedgerRow } from "@/lib/stores/commission/load-store-commission-ledger";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  CommissionStateChip,
  formatCashMinor,
  pickCommissionCopy,
  ROW_ACTION_BTN,
  type CommissionAudience,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translateBy } from "@/lib/i18n/translate-by";

export type CommissionRowTone = "anomaly" | "review" | "approved" | "rejected" | "normal";

/** Decision outranks row state: a rejected row that still owes fee is shown as "rejected" + unpaid badge. */
export function commissionRowTone(row: StoreCommissionLedgerRow, anomalyObligationIds?: ReadonlySet<string>): CommissionRowTone {
  if (anomalyObligationIds?.has(row.obligationId)) return "anomaly";
  if (row.state === "review_required") return "review";
  if (row.decision?.decision === "reject") return "rejected";
  if (row.decision) return "approved";
  return "normal";
}

/** Opaque token backgrounds (light + dark) — sticky cells reuse them so scrolled content never shows through. */
const TONE_BG: Record<CommissionRowTone, string> = {
  anomaly: "bg-sam-danger-soft",
  review: "bg-sam-warning-soft",
  approved: "bg-sam-success-soft",
  rejected: "bg-sam-danger-soft",
  normal: "bg-sam-surface",
};

const TONE_EDGE: Record<CommissionRowTone, string> = {
  anomaly: "border-l-4 border-l-sam-danger",
  review: "border-l-4 border-l-sam-warning",
  approved: "border-l-4 border-l-sam-success",
  rejected: "border-l-4 border-l-sam-danger",
  normal: "border-l-4 border-l-transparent",
};

export const COMMISSION_TONE_LABEL: Record<Exclude<CommissionRowTone, "normal">, { ko: string; en: string }> = {
  anomaly: catalogPair("stores_ledger_anomaly"),
  review: catalogPair("stores_awaiting_review_2"),
  approved: catalogPair("stores_refund_approved"),
  rejected: catalogPair("stores_refund_rejected"),
};

const TONE_BADGE: Record<Exclude<CommissionRowTone, "normal">, string> = {
  anomaly: "bg-sam-danger text-white",
  review: "bg-sam-warning text-white",
  approved: "bg-sam-success text-white",
  rejected: "bg-sam-danger text-white",
};

export function CommissionToneBadge({ tone, lang }: { tone: CommissionRowTone; lang: CommissionLang }) {
  if (tone === "normal") return null;
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${TONE_BADGE[tone]}`} data-tone-badge={tone}>
      {COMMISSION_TONE_LABEL[tone][lang]}
    </span>
  );
}

/** 사장님 화면만 「수수료 환급」 칩을 실제 처리(캐시 환급 / 미납 취소)로 — 관리자는 null(공용 이름 유지). F-3 */
function ownerStateLabel(r: StoreCommissionLedgerRow, audience: CommissionAudience, lang: CommissionLang): string | null {
  if (audience !== "owner" || r.state !== "refunded") return null;
  return commissionOwnerRefundedLabel(r.decision, lang);
}

/** Refund given back on this order (Cash refund + unpaid cancelled). */
function refundedMinor(r: StoreCommissionLedgerRow): number {
  return (r.decision?.cashRefundMinor ?? 0) + (r.decision?.outstandingCancelMinor ?? 0);
}

/** Cash actually taken from the store at charge time (current kept + already refunded). */
function cashDeductedMinor(r: StoreCommissionLedgerRow): number {
  return r.feePaidMinor + (r.decision?.cashRefundMinor ?? 0);
}

/**
 * Horizontal scroll container for wide tables: the page keeps vertical scroll, the table scrolls
 * sideways, and a hint + edge shadow tell the operator there is more to the right.
 */
export function HorizontalScrollRegion({ label, lang, children }: { label: string; lang: CommissionLang; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setOverflow({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);
  const scrollable = overflow.left || overflow.right;
  return (
    <div className="relative min-w-0">
      {scrollable ? (
        <p className="mb-1 sam-text-xxs text-sam-muted" data-scroll-hint="1">
          {translateBy(lang, "stores_scroll_the_table_sideways_for_more", undefined, "en")}
        </p>
      ) : null}
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto rounded-ui-rect border border-sam-border-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-signature"
        data-commission-scroll="1"
      >
        {children}
      </div>
      {overflow.right ? (
        <div className="pointer-events-none absolute bottom-0 right-0 top-6 w-6 bg-gradient-to-l from-black/10 to-transparent" aria-hidden />
      ) : null}
    </div>
  );
}

export function CommissionLedgerTable({
  rows,
  lang,
  showStore,
  onOpen,
  selectedObligationId,
  renderAction,
  anomalyObligationIds,
  audience = "admin",
}: {
  rows: StoreCommissionLedgerRow[];
  lang: CommissionLang;
  /** 사장님 화면은 「원장」 대신 「내역」 (Owner 2026-11-03). */
  audience?: CommissionAudience;
  showStore: boolean;
  onOpen: (row: StoreCommissionLedgerRow) => void;
  selectedObligationId?: string | null;
  /** Admin-only CTA (e.g. decide). Owners pass nothing → read-only. */
  renderAction?: (row: StoreCommissionLedgerRow) => ReactNode;
  anomalyObligationIds?: ReadonlySet<string>;
}) {
  const th = "whitespace-nowrap px-3 py-2 font-medium";
  const num = "whitespace-nowrap px-3 py-2 text-right tabular-nums";
  return (
    <HorizontalScrollRegion label={pickCommissionCopy(lang, audience === "owner" ? "수수료 내역 표" : "수수료 원장 표", audience === "owner" ? "Commission history table" : "Commission ledger table")} lang={lang}>
      <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-sm" data-commission-table="1">
        <thead className="sam-text-xxs text-sam-muted">
          <tr>
            <th className={`${th} sticky left-0 z-20 border-b border-sam-border-soft bg-sam-app`}>{translateBy(lang, "stores_order_2", undefined, "en")}</th>
            {showStore ? <th className={`${th} border-b border-sam-border-soft bg-sam-app`}>{translateBy(lang, "stores_store_2", undefined, "en")}</th> : null}
            <th className={`${th} border-b border-sam-border-soft bg-sam-app`}>{translateBy(lang, "stores_status", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_base_2", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_rate", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_charged", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_cash_taken", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_unpaid", undefined, "en")}</th>
            {/* 캐시 환급과 미납 취소를 한 칸에 합쳐 「환급」으로 보이던 결함 — 위 합계 칸과 같은 두 칸 (실기 T-8 발견 결함 2) */}
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_cash_refunded", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_unpaid_cancelled", undefined, "en")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app`}>{translateBy(lang, "stores_charged_pht", undefined, "en")}</th>
            <th className={`${th} sticky right-0 z-20 border-b border-sam-border-soft bg-sam-app text-right`}>{translateBy(lang, "stores_action", undefined, "en")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = commissionRowTone(r, anomalyObligationIds);
            const bg = TONE_BG[tone];
            const selected = selectedObligationId === r.obligationId;
            const cell = `border-b border-sam-border-soft ${bg}`;
            return (
              <tr
                key={r.obligationId}
                data-row-tone={tone}
                data-order-no={r.orderNo}
                aria-selected={selected}
                tabIndex={0}
                className={`cursor-pointer touch-manipulation transition-opacity active:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signature ${
                  selected ? "outline outline-2 -outline-offset-2 outline-signature" : ""
                }`}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onOpen(r);
                  }
                }}
              >
                <td className={`${cell} ${TONE_EDGE[tone]} sticky left-0 z-10 px-3 py-2`}>
                  <span className="block whitespace-nowrap font-mono text-[13px] font-semibold text-sam-fg">{r.orderNo}</span>
                  <span className="block whitespace-nowrap sam-text-xxs text-sam-muted">
                    {commissionOrderStatusLine(r, lang)}
                  </span>
                </td>
                {showStore ? (
                  <td className={`${cell} px-3 py-2`}>
                    <span className="block max-w-[14rem] break-words text-sam-fg">{r.storeName || r.storeId.slice(0, 8)}</span>
                  </td>
                ) : null}
                <td className={`${cell} px-3 py-2`}>
                  <div className="flex flex-wrap gap-1">
                    <CommissionToneBadge tone={tone} lang={lang} />
                    {tone !== "review" ? <CommissionStateChip state={r.state} lang={lang} label={ownerStateLabel(r, audience, lang)} /> : null}
                  </div>
                </td>
                <td className={`${cell} ${num}`}>{formatMoneyPhp(r.commissionBasePhp)}</td>
                <td className={`${cell} ${num}`}>{r.feePercent != null ? `${r.feePercent}%` : "—"}</td>
                <td className={`${cell} ${num}`}>{formatCashMinor(r.feeChargedMinor)}</td>
                <td className={`${cell} ${num}`}>{formatCashMinor(cashDeductedMinor(r))}</td>
                <td className={`${cell} ${num} ${r.feeOutstandingMinor > 0 ? "font-semibold text-sam-danger" : ""}`}>
                  {formatCashMinor(r.feeOutstandingMinor)}
                </td>
                <td className={`${cell} ${num}`}>
                  {(r.decision?.cashRefundMinor ?? 0) > 0 ? formatCashMinor(r.decision?.cashRefundMinor ?? 0) : "—"}
                </td>
                <td className={`${cell} ${num}`}>
                  {(r.decision?.outstandingCancelMinor ?? 0) > 0 ? formatCashMinor(r.decision?.outstandingCancelMinor ?? 0) : "—"}
                </td>
                <td className={`${cell} whitespace-nowrap px-3 py-2 sam-text-xxs text-sam-muted`}>{formatManilaDateTime(r.chargedAt)}</td>
                <td className={`${cell} sticky right-0 z-10 px-3 py-2 text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className={ROW_ACTION_BTN} onClick={() => onOpen(r)}>
                      {translateBy(lang, "stores_detail", undefined, "en")}
                    </button>
                    {renderAction ? renderAction(r) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </HorizontalScrollRegion>
  );
}

function DetailRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" | "good" }) {
  const toneClass = tone === "danger" ? "text-sam-danger" : tone === "good" ? "text-sam-success" : "text-sam-fg";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="sam-text-helper text-sam-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${toneClass}`}>{value}</dd>
    </div>
  );
}

/**
 * Order financial detail — same panel for Admin and Owner. Shows original fee, Cash actually taken,
 * unpaid, refundable amount, the frozen fee calculation and the full processing history.
 */
export function CommissionOrderDetailPanel({
  row,
  lang,
  onClose,
  footer,
  anomaly,
  orderHref,
  audience = "admin",
}: {
  row: StoreCommissionLedgerRow;
  lang: CommissionLang;
  onClose: () => void;
  /** 사장님 화면은 「원장」 대신 「내역」 (Owner 2026-11-03). */
  audience?: CommissionAudience;
  /** Order detail screen for this viewer (Admin order page / Owner order list). */
  orderHref?: string;
  /** Admin decision CTA for rows in review; Owner passes a read-only note. */
  footer?: ReactNode;
  anomaly?: boolean;
}) {
  const tone = commissionRowTone(row, anomaly ? new Set([row.obligationId]) : undefined);
  useRegisterOpenOverlay(true);
  const d = row.decision;
  const refundable = row.state === "review_required" ? row.feePaidMinor + row.feeOutstandingMinor : 0;
  const net = row.feeChargedMinor - refundedMinor(row);
  const b = row.feeBreakdown;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const history: Array<{ at: string | null; title: string; body?: string }> = [
    {
      at: row.chargedAt,
      title: pickCommissionCopy(
        lang,
        `수수료 부과 (${commissionOrderStatusLabel(row.chargeStage, row.fulfillmentType, lang)} 단계)`,
        `Commission charged (${commissionOrderStatusLabel(row.chargeStage, row.fulfillmentType, lang)})`
      ),
      body: pickCommissionCopy(lang, `부과 ${formatCashMinor(row.feeChargedMinor)} — Cash에서 자동 차감, 부족분은 미납`, `Charged ${formatCashMinor(row.feeChargedMinor)} — auto-debited from Cash, shortfall unpaid`),
    },
  ];
  if (row.reviewFlaggedAt || row.adjustmentTrigger) {
    history.push({
      at: row.reviewFlaggedAt,
      title:
        row.adjustmentTrigger === "refunded"
          ? translateBy(lang, "stores_refunded_commission_review", undefined, "en")
          : translateBy(lang, "stores_cancelled_after_cooking_commission_review", undefined, "en"),
    });
  }
  if (d) {
    history.push({
      at: d.decidedAt,
      // 사장님 화면에는 관리자 내부 id 대신 「운영팀」 (실기 O-2 발견 결함 1-f) · 관리자 화면은 그대로
      title: `${STORE_COMMISSION_DECISION_LABEL[d.decision][lang]}${
        audience === "owner"
          ? ` · ${translateBy(lang, "stores_operations", undefined, "en")}`
          : d.adminUserName
            ? ` · ${d.adminUserName}`
            : d.adminUserId
              ? ` · ${d.adminUserId.slice(0, 8)}…`
              : ""
      }`,
      body: pickCommissionCopy(
        lang,
        `승인 ${formatCashMinor(d.approvedMinor)} = Cash 환급 ${formatCashMinor(d.cashRefundMinor)} + 미납 취소 ${formatCashMinor(d.outstandingCancelMinor)} · 사유: ${d.reason}`,
        `Approved ${formatCashMinor(d.approvedMinor)} = Cash ${formatCashMinor(d.cashRefundMinor)} + unpaid cancelled ${formatCashMinor(d.outstandingCancelMinor)} · Reason: ${d.reason}`
      ),
    });
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-end bg-black/30 lg:items-stretch" role="dialog" aria-modal="true" aria-label={translateBy(lang, "stores_order_commission_detail", undefined, "en")} onClick={onClose}>
      <aside
        className="mx-auto flex max-h-[88dvh] w-full max-w-[32rem] flex-col rounded-t-[length:var(--overlay-radius-xl)] border border-b-0 border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] pb-[var(--kb-safe-bottom,var(--safe-bottom,0px))] shadow-[var(--overlay-elevation-3)] lg:mx-0 lg:max-h-none lg:w-[440px] lg:max-w-none lg:rounded-none lg:border-0 lg:pb-0"
        onClick={(e) => e.stopPropagation()}
        data-commission-detail="1"
      >
        <header className="flex items-start justify-between gap-2 border-b border-sam-border-soft p-4">
          <div className="min-w-0">
            <p className="break-all font-mono text-sm font-semibold text-sam-fg">{row.orderNo}</p>
            <p className="mt-0.5 break-words sam-text-helper text-sam-muted">
              {row.storeName} · {commissionOrderStatusLine(row, lang)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <CommissionToneBadge tone={tone} lang={lang} />
              <CommissionStateChip state={row.state} lang={lang} label={ownerStateLabel(row, audience, lang)} />
            </div>
            {orderHref ? (
              <Link href={orderHref} className="mt-1.5 inline-block sam-text-helper font-medium text-signature underline-offset-2 hover:underline">
                {translateBy(lang, "stores_open_order", undefined, "en")}
              </Link>
            ) : null}
          </div>
          <button type="button" className="sam-btn sam-btn--cancel sam-btn--sm shrink-0 whitespace-nowrap" onClick={onClose} aria-label="close">
            {translateBy(lang, "stores_close", undefined, "en")}
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <h3 className="sam-text-helper font-semibold text-sam-fg">{translateBy(lang, "stores_amounts", undefined, "en")}</h3>
            <dl className="mt-1 divide-y divide-sam-border-soft">
              <DetailRow label={translateBy(lang, "stores_commission_base_2", undefined, "en")} value={formatMoneyPhp(row.commissionBasePhp)} />
              <DetailRow label={translateBy(lang, "stores_original_commission", undefined, "en")} value={formatCashMinor(row.feeChargedMinor)} strong />
              <DetailRow label={translateBy(lang, "stores_cash_actually_taken", undefined, "en")} value={formatCashMinor(cashDeductedMinor(row))} />
              <DetailRow
                label={translateBy(lang, "stores_unpaid_now", undefined, "en")}
                value={formatCashMinor(row.feeOutstandingMinor)}
                tone={row.feeOutstandingMinor > 0 ? "danger" : undefined}
              />
              <DetailRow label={translateBy(lang, "stores_cash_refunded", undefined, "en")} value={formatCashMinor(d?.cashRefundMinor ?? 0)} />
              <DetailRow label={translateBy(lang, "stores_unpaid_cancelled", undefined, "en")} value={formatCashMinor(d?.outstandingCancelMinor ?? 0)} />
              {row.state === "review_required" ? (
                <DetailRow label={translateBy(lang, "stores_refundable_max", undefined, "en")} value={formatCashMinor(refundable)} tone="good" strong />
              ) : null}
              <DetailRow label={translateBy(lang, "stores_platform_net_commission", undefined, "en")} value={formatCashMinor(net)} strong />
            </dl>
          </section>
          <section>
            <h3 className="sam-text-helper font-semibold text-sam-fg">{translateBy(lang, "stores_fee_calculation_frozen_at_charge", undefined, "en")}</h3>
            {b ? (
              <dl className="mt-1 divide-y divide-sam-border-soft">
                <DetailRow label={translateBy(lang, "stores_policy", undefined, "en")} value={`${b.policyName ?? "—"}${commissionPolicyScopeLabel(b.scope, lang) ? ` (${commissionPolicyScopeLabel(b.scope, lang)})` : ""}`} />
                <DetailRow label={translateBy(lang, "stores_rate", undefined, "en")} value={row.feePercent != null ? `${row.feePercent}%` : "—"} />
                <DetailRow label={translateBy(lang, "stores_percent_fee", undefined, "en")} value={formatCashPhp2(b.percentFeePhp)} />
                <DetailRow label={translateBy(lang, "stores_fixed_fee", undefined, "en")} value={formatCashPhp2(b.fixedFeePhp)} />
                <DetailRow label={translateBy(lang, "stores_delivery_fee_income", undefined, "en")} value={formatCashPhp2(b.deliveryIncomePhp)} />
              </dl>
            ) : (
              <p className="mt-1 sam-text-helper text-sam-muted">{translateBy(lang, "stores_legacy_charge_no_policy_snapshot", undefined, "en")}</p>
            )}
          </section>
          <section>
            <h3 className="sam-text-helper font-semibold text-sam-fg">{translateBy(lang, "stores_history", undefined, "en")}</h3>
            <ol className="mt-1 space-y-2 border-l-2 border-sam-border-soft pl-3">
              {history.map((h, i) => (
                <li key={i}>
                  <p className="sam-text-xxs text-sam-muted">{h.at ? `${formatManilaDateTime(h.at)} PHT` : "—"}</p>
                  <p className="sam-text-helper font-medium text-sam-fg">{h.title}</p>
                  {h.body ? <p className="break-words sam-text-xxs text-sam-muted">{h.body}</p> : null}
                </li>
              ))}
            </ol>
            <p className="mt-2 sam-text-xxs text-sam-muted">
              {pickCommissionCopy(
                lang,
                audience === "owner"
                  ? "내역은 수정할 수 없습니다. 정정은 처리 기록으로만 남습니다."
                  : "원장은 수정할 수 없습니다. 정정은 결정 기록으로만 남습니다.",
                audience === "owner"
                  ? "History can't be edited; corrections are kept as records."
                  : "Ledgers are append-only; corrections are recorded decisions."
              )}
            </p>
          </section>
        </div>
        {footer ? <footer className="border-t border-sam-border-soft p-4">{footer}</footer> : null}
      </aside>
    </div>
  );
}

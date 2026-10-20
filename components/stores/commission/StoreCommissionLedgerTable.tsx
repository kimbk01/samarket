"use client";

/**
 * Commission ledger table + order detail panel — ONE component for Admin and Owner.
 * Admin injects the decision CTA (`renderAction`); Owner renders the same rows read-only.
 * Row tone = what the operator must know at a glance (review / approved / rejected / ledger anomaly);
 * every tone is also spelled out as a badge, never colour alone.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatMoneyPhp } from "@/lib/utils/format";
import { STORE_COMMISSION_DECISION_LABEL } from "@/lib/stores/commission/store-commission-contract";
import type { StoreCommissionLedgerRow } from "@/lib/stores/commission/load-store-commission-ledger";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  CommissionStateChip,
  formatCashMinor,
  pickCommissionCopy,
  ROW_ACTION_BTN,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";

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
  anomaly: { ko: "원장 이상", en: "Ledger anomaly" },
  review: { ko: "검토 대기", en: "Awaiting review" },
  approved: { ko: "환급 승인", en: "Refund approved" },
  rejected: { ko: "환급 반려", en: "Refund rejected" },
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
          {pickCommissionCopy(lang, "← 표를 좌우로 밀어 나머지 열을 확인하세요 →", "← Scroll the table sideways for more columns →")}
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
}: {
  rows: StoreCommissionLedgerRow[];
  lang: CommissionLang;
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
    <HorizontalScrollRegion label={pickCommissionCopy(lang, "수수료 원장 표", "Commission ledger table")} lang={lang}>
      <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-sm" data-commission-table="1">
        <thead className="sam-text-xxs text-sam-muted">
          <tr>
            <th className={`${th} sticky left-0 z-20 border-b border-sam-border-soft bg-sam-app`}>{pickCommissionCopy(lang, "주문번호", "Order")}</th>
            {showStore ? <th className={`${th} border-b border-sam-border-soft bg-sam-app`}>{pickCommissionCopy(lang, "매장", "Store")}</th> : null}
            <th className={`${th} border-b border-sam-border-soft bg-sam-app`}>{pickCommissionCopy(lang, "처리 상태", "Status")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "수수료 기준액", "Base")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "요율", "Rate")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "부과", "Charged")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "캐시 차감", "Cash taken")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "미납", "Unpaid")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "환급", "Refunded")}</th>
            <th className={`${th} border-b border-sam-border-soft bg-sam-app`}>{pickCommissionCopy(lang, "부과 시각 (PHT)", "Charged (PHT)")}</th>
            <th className={`${th} sticky right-0 z-20 border-b border-sam-border-soft bg-sam-app text-right`}>{pickCommissionCopy(lang, "액션", "Action")}</th>
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
                    {r.orderStatus || "—"}
                    {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
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
                    {tone !== "review" ? <CommissionStateChip state={r.state} lang={lang} /> : null}
                  </div>
                </td>
                <td className={`${cell} ${num}`}>{formatMoneyPhp(r.commissionBasePhp)}</td>
                <td className={`${cell} ${num}`}>{r.feePercent != null ? `${r.feePercent}%` : "—"}</td>
                <td className={`${cell} ${num}`}>{formatCashMinor(r.feeChargedMinor)}</td>
                <td className={`${cell} ${num}`}>{formatCashMinor(cashDeductedMinor(r))}</td>
                <td className={`${cell} ${num} ${r.feeOutstandingMinor > 0 ? "font-semibold text-sam-danger" : ""}`}>
                  {formatCashMinor(r.feeOutstandingMinor)}
                </td>
                <td className={`${cell} ${num}`}>{refundedMinor(r) > 0 ? formatCashMinor(refundedMinor(r)) : "—"}</td>
                <td className={`${cell} whitespace-nowrap px-3 py-2 sam-text-xxs text-sam-muted`}>{formatManilaDateTime(r.chargedAt)}</td>
                <td className={`${cell} sticky right-0 z-10 px-3 py-2 text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className={ROW_ACTION_BTN} onClick={() => onOpen(r)}>
                      {pickCommissionCopy(lang, "상세", "Detail")}
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
}: {
  row: StoreCommissionLedgerRow;
  lang: CommissionLang;
  onClose: () => void;
  /** Order detail screen for this viewer (Admin order page / Owner order list). */
  orderHref?: string;
  /** Admin decision CTA for rows in review; Owner passes a read-only note. */
  footer?: ReactNode;
  anomaly?: boolean;
}) {
  const tone = commissionRowTone(row, anomaly ? new Set([row.obligationId]) : undefined);
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
      title: pickCommissionCopy(lang, `수수료 부과 (${row.chargeStage} 진입)`, `Commission charged (entered ${row.chargeStage})`),
      body: pickCommissionCopy(lang, `부과 ${formatCashMinor(row.feeChargedMinor)} — 캐시에서 자동 차감, 부족분은 미납`, `Charged ${formatCashMinor(row.feeChargedMinor)} — auto-debited from Cash, shortfall unpaid`),
    },
  ];
  if (row.reviewFlaggedAt || row.adjustmentTrigger) {
    history.push({
      at: row.reviewFlaggedAt,
      title:
        row.adjustmentTrigger === "refunded"
          ? pickCommissionCopy(lang, "환불 — 수수료 검토 대기", "Refunded — commission review")
          : pickCommissionCopy(lang, "조리 후 취소 — 수수료 검토 대기", "Cancelled after cooking — commission review"),
    });
  }
  if (d) {
    history.push({
      at: d.decidedAt,
      title: `${STORE_COMMISSION_DECISION_LABEL[d.decision][lang]}${d.adminUserId ? ` · admin ${d.adminUserId.slice(0, 8)}` : ""}`,
      body: pickCommissionCopy(
        lang,
        `승인 ${formatCashMinor(d.approvedMinor)} = 캐시 환급 ${formatCashMinor(d.cashRefundMinor)} + 미납 취소 ${formatCashMinor(d.outstandingCancelMinor)} · 사유: ${d.reason}`,
        `Approved ${formatCashMinor(d.approvedMinor)} = Cash ${formatCashMinor(d.cashRefundMinor)} + unpaid cancelled ${formatCashMinor(d.outstandingCancelMinor)} · Reason: ${d.reason}`
      ),
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/30 lg:items-stretch" role="dialog" aria-modal="true" aria-label="order detail" onClick={onClose}>
      <aside
        className="flex max-h-[88vh] w-full flex-col rounded-t-ui-rect bg-sam-surface shadow-xl lg:max-h-none lg:w-[440px] lg:rounded-none"
        onClick={(e) => e.stopPropagation()}
        data-commission-detail="1"
      >
        <header className="flex items-start justify-between gap-2 border-b border-sam-border-soft p-4">
          <div className="min-w-0">
            <p className="break-all font-mono text-sm font-semibold text-sam-fg">{row.orderNo}</p>
            <p className="mt-0.5 break-words sam-text-helper text-sam-muted">
              {row.storeName} · {row.orderStatus}
              {row.paymentMethod ? ` · ${row.paymentMethod}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <CommissionToneBadge tone={tone} lang={lang} />
              <CommissionStateChip state={row.state} lang={lang} />
            </div>
            {orderHref ? (
              <Link href={orderHref} className="mt-1.5 inline-block sam-text-helper font-medium text-signature underline-offset-2 hover:underline">
                {pickCommissionCopy(lang, "주문 상세 보기", "Open order")}
              </Link>
            ) : null}
          </div>
          <button type="button" className="sam-btn sam-btn--cancel sam-btn--sm shrink-0 whitespace-nowrap" onClick={onClose} aria-label="close">
            {pickCommissionCopy(lang, "닫기", "Close")}
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <h3 className="sam-text-helper font-semibold text-sam-fg">{pickCommissionCopy(lang, "금액", "Amounts")}</h3>
            <dl className="mt-1 divide-y divide-sam-border-soft">
              <DetailRow label={pickCommissionCopy(lang, "수수료 기준액 (주문)", "Commission base")} value={formatMoneyPhp(row.commissionBasePhp)} />
              <DetailRow label={pickCommissionCopy(lang, "원래 부과 수수료", "Original commission")} value={formatCashMinor(row.feeChargedMinor)} strong />
              <DetailRow label={pickCommissionCopy(lang, "실제 캐시 차감", "Cash actually taken")} value={formatCashMinor(cashDeductedMinor(row))} />
              <DetailRow
                label={pickCommissionCopy(lang, "현재 미납", "Unpaid now")}
                value={formatCashMinor(row.feeOutstandingMinor)}
                tone={row.feeOutstandingMinor > 0 ? "danger" : undefined}
              />
              <DetailRow label={pickCommissionCopy(lang, "캐시 환급", "Cash refunded")} value={formatCashMinor(d?.cashRefundMinor ?? 0)} />
              <DetailRow label={pickCommissionCopy(lang, "미납 취소", "Unpaid cancelled")} value={formatCashMinor(d?.outstandingCancelMinor ?? 0)} />
              {row.state === "review_required" ? (
                <DetailRow label={pickCommissionCopy(lang, "환급 가능액 (최대)", "Refundable (max)")} value={formatCashMinor(refundable)} tone="good" strong />
              ) : null}
              <DetailRow label={pickCommissionCopy(lang, "플랫폼 순수수료", "Platform net commission")} value={formatCashMinor(net)} strong />
            </dl>
          </section>
          <section>
            <h3 className="sam-text-helper font-semibold text-sam-fg">{pickCommissionCopy(lang, "수수료 계산 (부과 시점 고정)", "Fee calculation (frozen at charge)")}</h3>
            {b ? (
              <dl className="mt-1 divide-y divide-sam-border-soft">
                <DetailRow label={pickCommissionCopy(lang, "정책", "Policy")} value={`${b.policyName ?? "—"}${b.scope ? ` (${b.scope})` : ""}`} />
                <DetailRow label={pickCommissionCopy(lang, "요율", "Rate")} value={row.feePercent != null ? `${row.feePercent}%` : "—"} />
                <DetailRow label={pickCommissionCopy(lang, "요율 수수료", "Percent fee")} value={formatMoneyPhp(b.percentFeePhp)} />
                <DetailRow label={pickCommissionCopy(lang, "고정 수수료", "Fixed fee")} value={formatMoneyPhp(b.fixedFeePhp)} />
                <DetailRow label={pickCommissionCopy(lang, "배달비 수수료", "Delivery fee income")} value={formatMoneyPhp(b.deliveryIncomePhp)} />
              </dl>
            ) : (
              <p className="mt-1 sam-text-helper text-sam-muted">{pickCommissionCopy(lang, "과거 부과 — 정책 스냅샷 없음", "Legacy charge — no policy snapshot")}</p>
            )}
          </section>
          <section>
            <h3 className="sam-text-helper font-semibold text-sam-fg">{pickCommissionCopy(lang, "처리 이력", "History")}</h3>
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
              {pickCommissionCopy(lang, "원장은 수정할 수 없습니다. 정정은 결정 기록으로만 남습니다.", "Ledgers are append-only; corrections are recorded decisions.")}
            </p>
          </section>
        </div>
        {footer ? <footer className="border-t border-sam-border-soft p-4">{footer}</footer> : null}
      </aside>
    </div>
  );
}

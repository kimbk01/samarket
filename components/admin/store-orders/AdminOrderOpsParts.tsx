"use client";

/** Shared UI parts for the order-ops screens (period filter · pager · summary panel · buttons). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { COMMISSION_PRESS } from "@/components/stores/commission/StoreCommissionLedgerParts";
import {
  ADMIN_ORDER_OPS_BASIS_LABEL,
  ADMIN_ORDER_OPS_PERIOD_LABEL,
  ADMIN_ORDER_OPS_PERIODS,
  type AdminOrderOpsBasis,
  type AdminOrderOpsPeriod,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { formatMoneyPhp } from "@/lib/utils/format";

export const OPS_INPUT =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-2 sam-text-helper text-sam-fg placeholder:text-sam-meta focus:border-signature focus:outline-none";
export const OPS_PRIMARY_BTN = `inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-ui-rect bg-signature px-4 py-2 sam-text-helper font-semibold text-white hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${COMMISSION_PRESS}`;
export const OPS_SECONDARY_BTN = `inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${COMMISSION_PRESS}`;
export const OPS_ROW_BTN = `inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted ${COMMISSION_PRESS}`;
const PAGER_BTN = `inline-flex min-h-9 min-w-9 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted disabled:cursor-not-allowed disabled:opacity-40 ${COMMISSION_PRESS}`;

export function OpsPeriodFilter({
  period,
  fromDay,
  toDay,
  ko,
  onChange,
}: {
  period: AdminOrderOpsPeriod;
  fromDay: string;
  toDay: string;
  ko: boolean;
  onChange: (next: { period: AdminOrderOpsPeriod; fromDay: string; toDay: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={ko ? "기간" : "Period"}>
      {ADMIN_ORDER_OPS_PERIODS.map((p) => {
        const active = p === period;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ period: p, fromDay, toDay })}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 sam-text-helper ${COMMISSION_PRESS} ${
              active ? "border-signature bg-signature/10 font-semibold text-signature" : "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-surface-muted"
            }`}
          >
            {ko ? ADMIN_ORDER_OPS_PERIOD_LABEL[p].ko : ADMIN_ORDER_OPS_PERIOD_LABEL[p].en}
          </button>
        );
      })}
      {period === "custom" ? (
        <span className="flex items-center gap-1">
          <input type="date" className={`${OPS_INPUT} w-auto`} value={fromDay} onChange={(e) => onChange({ period, fromDay: e.target.value, toDay })} aria-label={ko ? "시작일" : "From"} />
          <span className="text-sam-muted">~</span>
          <input type="date" className={`${OPS_INPUT} w-auto`} value={toDay} onChange={(e) => onChange({ period, fromDay, toDay: e.target.value })} aria-label={ko ? "종료일" : "To"} />
        </span>
      ) : null}
    </div>
  );
}

export function OpsPager({
  page,
  pageSize,
  total,
  busy,
  ko,
  onGo,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  ko: boolean;
  onGo: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const go = (p: number) => {
    const next = Math.min(pages, Math.max(1, Math.floor(p) || 1));
    if (next !== page) onGo(next);
    else setJump(String(page));
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 sam-text-helper" data-admin-orders-pager="1">
      <span className="tabular-nums text-sam-muted">
        {ko ? `전체 ${total.toLocaleString()}건 · ${from.toLocaleString()}–${to.toLocaleString()}` : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={PAGER_BTN} disabled={busy || page <= 1} onClick={() => go(1)} aria-label={ko ? "첫 페이지" : "First page"}>
          «
        </button>
        <button type="button" className={PAGER_BTN} disabled={busy || page <= 1} onClick={() => go(page - 1)}>
          {ko ? "이전" : "Prev"}
        </button>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(Number(jump));
          }}
        >
          <input
            className="w-14 rounded-ui-rect border border-sam-border bg-sam-surface px-1.5 py-1.5 text-center tabular-nums text-sam-fg"
            inputMode="numeric"
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
            disabled={busy || pages <= 1}
            aria-label={ko ? "페이지 번호" : "Page number"}
          />
          <span className="tabular-nums text-sam-muted">/ {pages.toLocaleString()}</span>
        </form>
        <button type="button" className={PAGER_BTN} disabled={busy || page >= pages} onClick={() => go(page + 1)}>
          {ko ? "다음" : "Next"}
        </button>
        <button type="button" className={PAGER_BTN} disabled={busy || page >= pages} onClick={() => go(pages)} aria-label={ko ? "마지막 페이지" : "Last page"}>
          »
        </button>
      </div>
    </div>
  );
}

export type OpsSummaryCard = {
  key: string;
  label: string;
  count: number | null;
  /** Main money line (already formatted by caller) */
  amount?: number | null;
  amountLabel?: string;
  secondary?: string | null;
  basis: AdminOrderOpsBasis | "current";
  tone?: "default" | "warning" | "danger";
  /** Same-screen action */
  onClick?: () => void;
  /** Another screen */
  href?: string;
  active?: boolean;
};

export function OpsSummaryPanel({
  title,
  basisNote,
  cards,
  open,
  onToggle,
  loading,
  error,
  ko,
}: {
  title: string;
  basisNote: string;
  cards: OpsSummaryCard[];
  open: boolean;
  onToggle: () => void;
  loading: boolean;
  error: string | null;
  ko: boolean;
}) {
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface" data-ops-summary="1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left ${COMMISSION_PRESS}`}
      >
        <span className="sam-text-body font-semibold text-sam-fg">
          {title} <span className="ml-1 font-normal sam-text-xxs text-sam-muted">{basisNote}</span>
        </span>
        <span className="sam-text-xxs text-sam-muted">{open ? (ko ? "접기" : "Hide") : ko ? "펼치기" : "Show"}</span>
      </button>
      {open ? (
        <div className="border-t border-sam-border-soft p-3">
          {error ? (
            <p role="alert" className="mb-2 rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-busy={loading}>
            {cards.map((c) => {
              const body = (
                <>
                  <span className="sam-text-xxs text-sam-muted">{c.label}</span>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      c.tone === "danger" ? "text-sam-danger" : c.tone === "warning" ? "text-sam-warning" : "text-sam-fg"
                    }`}
                  >
                    {loading && c.count == null ? "…" : c.count == null ? "—" : `${c.count.toLocaleString()}${ko ? "건" : ""}`}
                  </span>
                  {c.amount != null ? (
                    <span className="sam-text-xxs tabular-nums text-sam-fg">
                      {c.amountLabel ? `${c.amountLabel} ` : ""}
                      {formatMoneyPhp(c.amount)}
                    </span>
                  ) : null}
                  {c.secondary ? <span className="sam-text-xxs tabular-nums text-sam-muted">{c.secondary}</span> : null}
                  <span className="mt-0.5 sam-text-xxs text-sam-meta">
                    {c.basis === "current"
                      ? ko
                        ? "현재 기준"
                        : "Current"
                      : `${ko ? ADMIN_ORDER_OPS_BASIS_LABEL[c.basis].ko : ADMIN_ORDER_OPS_BASIS_LABEL[c.basis].en} ${ko ? "기준" : "basis"}`}
                    {c.href ? (ko ? " · 이동 →" : " · open →") : ""}
                  </span>
                </>
              );
              const cls = `flex flex-col items-start gap-0.5 rounded-ui-rect border px-3 py-2 text-left ${COMMISSION_PRESS} ${
                c.active ? "border-signature bg-signature/5" : "border-sam-border-soft bg-sam-app hover:bg-sam-surface-muted"
              }`;
              if (c.href) {
                return (
                  <Link key={c.key} href={c.href} className={cls} data-summary-card={c.key}>
                    {body}
                  </Link>
                );
              }
              return (
                <button key={c.key} type="button" onClick={c.onClick} disabled={!c.onClick} className={cls} data-summary-card={c.key}>
                  {body}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** "3일 4시간" since `iso` (display only). */
export function elapsedSince(iso: string | null | undefined, ko: boolean, now: number = Date.now()): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  const mins = Math.max(0, Math.floor((now - ms) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return ko ? `${d}일 ${h}시간` : `${d}d ${h}h`;
  if (h > 0) return ko ? `${h}시간 ${m}분` : `${h}h ${m}m`;
  return ko ? `${m}분` : `${m}m`;
}

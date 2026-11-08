"use client";

/**
 * CUT B — Admin Finance ops action queue (presentation over canonical APIs).
 * Does not invent ledgers or unify Point/Coin/Cash.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
type QueueState = {
  pointPending: number;
  cashPending: number;
  coinWithdrawOpen: number;
  loaded: boolean;
  error: string | null;
};

const INITIAL: QueueState = {
  pointPending: 0,
  cashPending: 0,
  coinWithdrawOpen: 0,
  loaded: false,
  error: null,
};

function isPointActionable(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "pending" || s === "waiting_confirm" || s === "on_hold";
}

export function AdminFinanceOpsQueue() {
  const { safeT } = useI18n();
  const [state, setState] = useState<QueueState>(INITIAL);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      const [pointRes, cashRes, coinRes] = await Promise.all([
        // 서버 exact count (`total`) — 처리 대기(pending·waiting_confirm·on_hold)만, 행은 1건만 받는다.
        fetch("/api/admin/point-charges?status=open&limit=1", { credentials: "include", cache: "no-store" }),
        // 건수 = 서버 count(total) — 예전 100건 목록 길이로 세면 100건 넘을 때 덜 셌다 (R7)
        fetch("/api/admin/business-cash-charges?status=PENDING&limit=20&offset=0", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/coin-withdrawals?status=REQUESTED&limit=20&offset=0", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      let pointPending = 0;
      if (pointRes.ok) {
        const json = (await pointRes.json()) as {
          ok?: boolean;
          total?: number;
          requests?: Array<{ requestStatus?: string; request_status?: string; status?: string }>;
        };
        if (json.ok) {
          pointPending =
            typeof json.total === "number"
              ? json.total
              : (json.requests ?? []).filter((r) =>
                  isPointActionable(String(r.requestStatus ?? r.request_status ?? r.status ?? ""))
                ).length;
        }
      }

      let cashPending = 0;
      if (cashRes.ok) {
        const json = (await cashRes.json()) as {
          ok?: boolean;
          total?: number;
          requests?: unknown[];
        };
        if (json.ok) cashPending = typeof json.total === "number" ? json.total : (json.requests ?? []).length;
      }

      let coinWithdrawOpen = 0;
      if (coinRes.ok) {
        const json = (await coinRes.json()) as {
          ok?: boolean;
          total?: number;
          requests?: unknown[];
        };
        if (json.ok) {
          coinWithdrawOpen = typeof json.total === "number" ? json.total : (json.requests ?? []).length;
        }
      }

      setState({
        pointPending,
        cashPending,
        coinWithdrawOpen,
        loaded: true,
        error: null,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        loaded: true,
        error: "network",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = state.pointPending + state.cashPending + state.coinWithdrawOpen;

  return (
    <section
      className="rounded-ui-rect border border-amber-200 bg-amber-50/70 p-4"
      data-admin-finance-ops-queue="1"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-amber-950">
            {safeT("admin_finance_ops_queue_title")}
          </h2>
          <p className="mt-1 text-[13px] text-amber-900/80">
            {safeT("admin_finance_ops_queue_help")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[36px] shrink-0 rounded-ui-rect border border-amber-300 bg-sam-surface px-3 text-[12px] font-semibold text-amber-900"
        >
          {safeT("admin_finance_ops_queue_refresh")}
        </button>
      </div>

      {!state.loaded ? (
        <p className="mt-3 text-[13px] text-sam-muted">
          {safeT("common_loading")}
        </p>
      ) : state.error ? (
        <p className="mt-3 text-[13px] text-red-600" role="alert">
          {safeT("admin_finance_ops_queue_load_failed")}
        </p>
      ) : total === 0 ? (
        <p className="mt-3 text-[13px] text-sam-muted" data-admin-finance-ops-queue-empty="1">
          {safeT("admin_finance_ops_queue_empty")}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          <li>
            <Link
              href="/admin/point-charges"
              className="flex min-h-[44px] items-center gap-2 rounded-ui-rect border border-[var(--currency-point-border)] bg-sam-surface px-3 py-2"
              data-admin-finance-ops-point="1"
            >
              <CurrencyBadge currency="point" />
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-sam-fg">
                {safeT("admin_finance_ops_point_pending")}
              </span>
              <span className="tabular-nums text-[13px] font-bold text-[var(--currency-point-accent)]">
                {state.pointPending}
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/delivery-ads/cash-charges"
              className="flex min-h-[44px] items-center gap-2 rounded-ui-rect border border-[var(--currency-cash-border)] bg-sam-surface px-3 py-2"
              data-admin-finance-ops-cash="1"
            >
              <CurrencyBadge currency="cash" />
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-sam-fg">
                {safeT("admin_finance_ops_cash_pending")}
              </span>
              <span className="tabular-nums text-[13px] font-bold text-[var(--currency-cash-accent)]">
                {state.cashPending}
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/finance#coin-withdrawals"
              className="flex min-h-[44px] items-center gap-2 rounded-ui-rect border border-[var(--currency-coin-border)] bg-sam-surface px-3 py-2"
              data-admin-finance-ops-coin="1"
            >
              <CurrencyBadge currency="coin" />
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-sam-fg">
                {safeT("admin_finance_ops_coin_withdraw")}
              </span>
              <span className="tabular-nums text-[13px] font-bold text-[var(--currency-coin-accent)]">
                {state.coinWithdrawOpen}
              </span>
            </Link>
          </li>
        </ul>
      )}

      <p className="mt-3 text-[11px] text-sam-muted">
        {safeT("admin_finance_ops_queue_footnote")}
      </p>
    </section>
  );
}

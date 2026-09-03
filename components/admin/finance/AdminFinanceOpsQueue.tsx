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
        fetch("/api/admin/point-charges", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/business-cash-charges?status=PENDING", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/coin-withdrawals?status=REQUESTED", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      let pointPending = 0;
      if (pointRes.ok) {
        const json = (await pointRes.json()) as {
          ok?: boolean;
          requests?: Array<{ status?: string; request_status?: string }>;
        };
        if (json.ok) {
          pointPending = (json.requests ?? []).filter((r) =>
            isPointActionable(
              String(
                (r as { status?: string; requestStatus?: string; request_status?: string })
                  .requestStatus ??
                  (r as { request_status?: string }).request_status ??
                  (r as { status?: string }).status ??
                  ""
              )
            )
          ).length;
        }
      }

      let cashPending = 0;
      if (cashRes.ok) {
        const json = (await cashRes.json()) as {
          ok?: boolean;
          requests?: unknown[];
        };
        if (json.ok) cashPending = (json.requests ?? []).length;
      }

      let coinWithdrawOpen = 0;
      if (coinRes.ok) {
        const json = (await coinRes.json()) as {
          ok?: boolean;
          requests?: unknown[];
        };
        if (json.ok) {
          coinWithdrawOpen = (json.requests ?? []).length;
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
            {safeT("admin_finance_ops_queue_title", {
              fallbackKo: "처리 필요",
              fallbackEn: "Needs action",
            })}
          </h2>
          <p className="mt-1 text-[13px] text-amber-900/80">
            {safeT("admin_finance_ops_queue_help", {
              fallbackKo:
                "Point · Coin · Cash는 서로 다른 자산입니다. 대기 항목만 먼저 처리하세요.",
              fallbackEn:
                "Point, Coin, and Cash are separate assets. Handle waiting items first.",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[36px] shrink-0 rounded-ui-rect border border-amber-300 bg-sam-surface px-3 text-[12px] font-semibold text-amber-900"
        >
          {safeT("admin_finance_ops_queue_refresh", { fallbackKo: "새로고침", fallbackEn: "Refresh" })}
        </button>
      </div>

      {!state.loaded ? (
        <p className="mt-3 text-[13px] text-sam-muted">
          {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : state.error ? (
        <p className="mt-3 text-[13px] text-red-600" role="alert">
          {safeT("admin_finance_ops_queue_load_failed", {
            fallbackKo: "처리 대기 목록을 불러오지 못했습니다. 자산 잔액은 변경되지 않았습니다.",
            fallbackEn: "Couldn’t load the action queue. Balances were not changed.",
          })}
        </p>
      ) : total === 0 ? (
        <p className="mt-3 text-[13px] text-sam-muted" data-admin-finance-ops-queue-empty="1">
          {safeT("admin_finance_ops_queue_empty", {
            fallbackKo: "지금 처리할 금융 항목이 없습니다.",
            fallbackEn: "No finance items need action right now.",
          })}
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
                {safeT("admin_finance_ops_point_pending", {
                  fallbackKo: "Point 충전 대기",
                  fallbackEn: "Point top-ups waiting",
                })}
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
                {safeT("admin_finance_ops_cash_pending", {
                  fallbackKo: "Cash 충전 대기",
                  fallbackEn: "Cash top-ups waiting",
                })}
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
                {safeT("admin_finance_ops_coin_withdraw", {
                  fallbackKo: "Coin 출금 대기",
                  fallbackEn: "Coin withdrawals open",
                })}
              </span>
              <span className="tabular-nums text-[13px] font-bold text-[var(--currency-coin-accent)]">
                {state.coinWithdrawOpen}
              </span>
            </Link>
          </li>
        </ul>
      )}

      <p className="mt-3 text-[11px] text-sam-muted">
        {safeT("admin_finance_ops_queue_footnote", {
          fallbackKo: "금액·매장 상세는 각 대기열에서 확인합니다.",
          fallbackEn: "Amounts and store context are on each queue.",
        })}
      </p>
    </section>
  );
}

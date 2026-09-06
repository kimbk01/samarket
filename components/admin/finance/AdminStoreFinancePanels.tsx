"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminCoinWithdrawalsPanel } from "@/components/admin/finance/AdminCoinWithdrawalsPanel";
import { AdminFinanceControlPlane } from "@/components/admin/finance/AdminFinanceControlPlane";
import { AdminStoreFinancialStatement } from "@/components/admin/finance/AdminStoreFinancialStatement";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type LedgerRow = {
  id: string;
  entryKind: string;
  amount?: number;
  balanceAfter?: number;
  amountMinor?: number;
  balanceAfterMinor?: number;
  createdAt: string;
};

type FinancePayload = {
  ok?: boolean;
  error?: string;
  store?: { id: string; name: string };
  coin?: { balance: number; ledger: LedgerRow[] };
  cash?: {
    balanceMinor: number;
    currency: string;
    ledger: LedgerRow[];
    topUps: Array<{
      id: string;
      amount_minor: number;
      status: string;
      created_at: string;
    }>;
    obligations: {
      outstandingMinor: number;
      rows: Array<{
        id: string;
        order_id: string;
        fee_outstanding_minor: number;
        status: string;
        created_at: string;
      }>;
    };
  };
};

function php(minor: number): string {
  return `₱${(Math.trunc(Number(minor) || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Admin finance — paired Coin (Gold) + Cash (Green) sections per CUT 3/5. */
export function AdminStoreFinancePanels() {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState("");
  const [data, setData] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [statementStoreId, setStatementStoreId] = useState("");

  useEffect(() => {
    const sid = searchParams.get("storeId")?.trim() ?? "";
    if (sid) {
      setStoreId(sid);
      setStatementStoreId(sid);
    }
    // view=statement is legacy query; storeId alone mounts statement panels.
  }, [searchParams]);

  const load = async (event: FormEvent) => {
    event.preventDefault();
    const sid = storeId.trim();
    if (!sid || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/store-finance?storeId=${encodeURIComponent(sid)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as FinancePayload;
      if (!res.ok || !json.ok) {
        setData(null);
        setError(
          safeT("admin_store_finance_load_failed", {
            fallbackKo: "매장 재무 정보를 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load store finance.",
          })
        );
        return;
      }
      setData(json);
      setStatementStoreId(sid);
    } catch {
      setData(null);
      setError(
        safeT("common_network_error", {
          fallbackKo: "네트워크 오류가 발생했습니다.",
          fallbackEn: "A network error occurred.",
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-store-finance-panels="1">
      {/* ARO-OPS-UX-002-B4: Control Plane always first. B3 Statement is store drill-down. */}
      <AdminFinanceControlPlane />

      {statementStoreId ? (
        <div id="store-financial-statement">
          <AdminStoreFinancialStatement storeId={statementStoreId} />
        </div>
      ) : null}

      <form
        onSubmit={(event) => void load(event)}
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        id="store-finance-lookup"
      >
        <label className="text-sm font-semibold text-sam-fg" htmlFor="admin-finance-store-id">
          {safeT("admin_store_finance_store_id", {
            fallbackKo: "매장 ID",
            fallbackEn: "Store ID",
          })}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="admin-finance-store-id"
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
            className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            placeholder={safeT("admin_store_finance_store_id_placeholder", {
              fallbackKo: "조회할 매장 ID를 입력하세요",
              fallbackEn: "Enter a store ID",
            })}
          />
          <button
            type="submit"
            disabled={loading || !storeId.trim()}
            className="rounded-ui-rect bg-sam-fg px-4 py-2 text-sm font-semibold text-sam-app disabled:opacity-50"
          >
            {loading
              ? safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })
              : safeT("admin_store_finance_load", { fallbackKo: "재무 조회", fallbackEn: "Load finance" })}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </form>

      <section className="rounded-ui-rect border border-[var(--currency-point-border)] bg-[var(--currency-point-bg)] p-4">
        <div className="flex items-center gap-2">
          <CurrencyBadge currency="point" />
          <h2 className="text-base font-semibold text-sam-fg">
            {safeT("admin_store_finance_point", {
              fallbackKo: "회원 Point 운영",
              fallbackEn: "Member Point operations",
            })}
          </h2>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ["/admin/point-charges", "admin_menu_points_charge", "Point top-up"],
            ["/admin/points/ledger", "admin_menu_points_ledger", "Point ledger"],
            ["/admin/point-policies", "admin_menu_points_policy", "Point policy"],
            ["/admin/point-executions", "admin_menu_points_execute", "Point execution"],
          ] as const).map(([href, key, fallbackEn]) => (
            <Link
              key={href}
              href={href}
              className="rounded-ui-rect border border-[var(--currency-point-border)] bg-sam-surface px-3 py-2 text-sm font-semibold text-[var(--currency-point-accent)]"
            >
              {safeT(key, { fallbackKo: fallbackEn, fallbackEn })}
            </Link>
          ))}
        </div>
      </section>

      <section
        className="rounded-ui-rect border border-[var(--currency-coin-border)] bg-[var(--currency-coin-bg)] p-4"
        data-admin-coin-finance-panel="1"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CurrencyBadge currency="coin" />
            <h2 className="text-base font-semibold text-sam-fg">
              {safeT("admin_store_finance_coin", {
                fallbackKo: "Coin 잔액·원장",
                fallbackEn: "Coin balance & ledger",
              })}
            </h2>
          </div>
          <span className="text-lg font-bold text-[var(--currency-coin-accent)]">
            {(data?.coin?.balance ?? 0).toLocaleString()} Coin
          </span>
        </div>
        <FinanceLedger rows={data?.coin?.ledger ?? []} kind="coin" safeT={safeT} />
      </section>

      <div id="coin-withdrawals">
        <AdminCoinWithdrawalsPanel />
      </div>

      <section
        className="rounded-ui-rect border border-[var(--currency-cash-border)] bg-[var(--currency-cash-bg)] p-4"
        data-admin-cash-finance-panel="1"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CurrencyBadge currency="cash" />
            <h2 className="text-base font-semibold text-sam-fg">
              {safeT("admin_store_finance_cash", {
                fallbackKo: "Cash 잔액·원장·의무",
                fallbackEn: "Cash balance, ledger & obligations",
              })}
            </h2>
          </div>
          <span className="text-lg font-bold text-[var(--currency-cash-accent)]">
            {php(data?.cash?.balanceMinor ?? 0)}
          </span>
        </div>
        <FinanceLedger rows={data?.cash?.ledger ?? []} kind="cash" safeT={safeT} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-sm font-semibold text-sam-fg">
              {safeT("admin_store_finance_cash_topups", {
                fallbackKo: "Cash 충전 신청",
                fallbackEn: "Cash top-up requests",
              })}
            </p>
            <p className="mt-1 text-sm text-sam-muted">
              {(data?.cash?.topUps ?? []).length.toLocaleString()}
            </p>
            <Link
              href="/admin/delivery-ads/cash-charges"
              className="mt-2 inline-block text-sm font-semibold text-[var(--currency-cash-accent)] hover:underline"
            >
              {safeT("admin_store_finance_open_topups", {
                fallbackKo: "충전 대기열 열기",
                fallbackEn: "Open top-up queue",
              })}
            </Link>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-sm font-semibold text-sam-fg">
              {safeT("admin_store_finance_obligations", {
                fallbackKo: "미결제 판매 수수료 의무",
                fallbackEn: "Open sale-fee obligations",
              })}
            </p>
            <p className="mt-1 text-sm text-sam-muted">
              {(data?.cash?.obligations.rows ?? []).length.toLocaleString()} ·{" "}
              {php(data?.cash?.obligations.outstandingMinor ?? 0)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="font-semibold text-sam-fg">
          {safeT("admin_store_finance_bc_archive", {
            fallbackKo: "이전 매장 운영 원장 보관함",
            fallbackEn: "Historical store operations ledger archive",
          })}
        </h2>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("admin_store_finance_bc_archive_desc", {
            fallbackKo: "비제품 과거 기록입니다. 충전·조정·승인 작업은 제공하지 않습니다.",
            fallbackEn: "Non-product historical records only. No top-up, adjustment, or approval actions are available.",
          })}
        </p>
        <Link
          href="/admin/store-point-ledger"
          className="mt-2 inline-block text-sm font-semibold text-signature hover:underline"
        >
          {safeT("admin_store_finance_bc_archive_open", {
            fallbackKo: "읽기 전용 보관함 열기",
            fallbackEn: "Open read-only archive",
          })}
        </Link>
      </section>
    </div>
  );
}

function FinanceLedger({
  rows,
  kind,
  safeT,
}: {
  rows: LedgerRow[];
  kind: "coin" | "cash";
  safeT: ReturnType<typeof useI18n>["safeT"];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("admin_store_finance_ledger_empty", {
          fallbackKo: "표시할 원장 내역이 없습니다.",
          fallbackEn: "No ledger entries to show.",
        })}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-sam-border">
      {rows.map((row) => {
        const amount = kind === "coin" ? row.amount ?? 0 : row.amountMinor ?? 0;
        const balance = kind === "coin" ? row.balanceAfter ?? 0 : row.balanceAfterMinor ?? 0;
        return (
          <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span className="text-sam-fg">
              {row.entryKind} · {new Date(row.createdAt).toLocaleString()}
            </span>
            <span className="font-semibold tabular-nums">
              {kind === "coin" ? `${amount.toLocaleString()} → ${balance.toLocaleString()} Coin` : `${php(amount)} → ${php(balance)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import Link from "next/link";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { financeRelatedTargetLabel, financeStatusLabel, financeTypeLabel, formatFinanceAmount } from "@/lib/finance/presentation";
import { AdminCashLedgerIntegrityPanel, type AdminCashIntegrityPayload } from "@/components/admin/finance/AdminCashLedgerIntegrityPanel";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminCoinWithdrawalsPanel } from "@/components/admin/finance/AdminCoinWithdrawalsPanel";
import { AdminFinanceControlPlane } from "@/components/admin/finance/AdminFinanceControlPlane";
import { AdminFinanceTransparentPanels } from "@/components/admin/finance/AdminFinanceTransparentPanels";
import { AdminStoreFinancialStatement } from "@/components/admin/finance/AdminStoreFinancialStatement";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminStoreBalanceCorrectionForm } from "@/components/admin/finance/AdminStoreBalanceCorrectionForm";

type LedgerRow = {
  id: string;
  entryKind: string;
  direction?: string;
  relatedType?: string;
  relatedId?: string;
  actorType?: string;
  actorUserId?: string | null;
  idempotencyKey?: string;
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
  /** P0-1 — balance null = 조회 실패 (「—」 표시, 0 으로 대체 금지) */
  coin?: { balance: number | null; ledger: LedgerRow[] };
  /** P0-6 — Cash 원장 연쇄·잔액 대조 (FAIL 은 그대로 표시). */
  cashIntegrity?: AdminCashIntegrityPayload;
  cash?: {
    balanceMinor: number | null;
    currency: string;
    ledger: LedgerRow[];
    topUps: Array<{
      id: string;
      amount_minor: number;
      status: string;
      created_at: string;
      decided_at?: string | null;
      payment_method?: string | null;
      payment_reference?: string | null;
      proof_file_path?: string | null;
      reject_reason?: string | null;
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
  const { safeT, language } = useI18n();
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
    await fetchFinance(storeId.trim());
  };

  const fetchFinance = async (sid: string) => {
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

      <AdminFinanceTransparentPanels />

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
            {data?.coin?.balance == null ? "—" : `${data.coin.balance.toLocaleString()} Coin`}
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
            {data?.cash?.balanceMinor == null ? "—" : php(data.cash.balanceMinor)}
          </span>
        </div>
        <FinanceLedger rows={data?.cash?.ledger ?? []} kind="cash" safeT={safeT} />
        <AdminCashLedgerIntegrityPanel report={data?.cashIntegrity} ko={language !== "en"} />
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
            {/* P1 — 입금 근거: 방법 · 참조번호 · 증빙 유무 · 상태 · 반려 사유 (근거 없는 승인 건은 「없음」으로 그대로 표시) */}
            <ul className="mt-2 space-y-1 text-xs" data-admin-cash-topup-evidence="1">
              {(data?.cash?.topUps ?? []).slice(0, 20).map((r) => (
                <li key={r.id} className="rounded-ui-rect border border-sam-border-soft px-2 py-1">
                  <span className="font-semibold tabular-nums">{php(r.amount_minor)}</span>
                  {" · "}
                  {financeStatusLabel(r.status, language !== "en")}
                  {" · "}
                  {formatAdminManilaDateTime(r.created_at)}
                  <br />
                  <span className={r.payment_reference ? "text-sam-muted" : "text-sam-danger"}>
                    {language !== "en" ? "입금 방법" : "Method"}: {r.payment_method || "—"} ·{" "}
                    {language !== "en" ? "참조번호" : "Reference"}: {r.payment_reference || (language !== "en" ? "없음" : "none")} ·{" "}
                    {language !== "en" ? "증빙" : "Proof"}: {r.proof_file_path ? (language !== "en" ? "있음" : "yes") : language !== "en" ? "없음" : "none"}
                  </span>
                  {r.reject_reason ? (
                    <>
                      <br />
                      <span className="text-sam-muted">{language !== "en" ? "반려 사유" : "Reject reason"}: {r.reject_reason}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
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

      {data?.store?.id ? (
        <AdminStoreBalanceCorrectionForm
          key={data.store.id}
          storeId={data.store.id}
          storeName={data.store.name || data.store.id}
          ko={language !== "en"}
          onDone={() => fetchFinance(data.store?.id ?? "")}
        />
      ) : null}

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

/**
 * P1 — 관리자 Coin·Cash 원장: 거래 ID · 시각(PHT) · 유형 · 이전 잔액 · 증감(부호) · 처리 후 · 처리 주체 · 원천.
 * 이전 잔액 = 같은 행의 처리 후 − 증감 (원장 기록값, 화면 추정 아님).
 */
function FinanceLedger({
  rows,
  kind,
  safeT,
}: {
  rows: LedgerRow[];
  kind: "coin" | "cash";
  safeT: ReturnType<typeof useI18n>["safeT"];
}) {
  const { language } = useI18n();
  const ko = language !== "en";
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
  const fmt = (n: number) =>
    kind === "coin" ? formatFinanceAmount({ wallet: "COIN", amount: n }) : formatFinanceAmount({ wallet: "CASH", amount: n, isMinor: true });
  const signedText = (n: number) => (n < 0 ? `−${fmt(Math.abs(n))}` : `+${fmt(n)}`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm" data-admin-ledger-table={kind}>
        <thead>
          <tr className="border-b border-sam-border text-left text-sam-muted">
            <th className="px-2 py-1.5 font-medium">{ko ? "거래 ID" : "Txn ID"}</th>
            <th className="px-2 py-1.5 font-medium">{ko ? "일시 (PHT)" : "Time (PHT)"}</th>
            <th className="px-2 py-1.5 font-medium">{ko ? "유형" : "Type"}</th>
            <th className="px-2 py-1.5 text-right font-medium">{ko ? "이전 잔액" : "Before"}</th>
            <th className="px-2 py-1.5 text-right font-medium">{ko ? "증감" : "Change"}</th>
            <th className="px-2 py-1.5 text-right font-medium">{ko ? "처리 후" : "After"}</th>
            <th className="px-2 py-1.5 font-medium">{ko ? "처리 주체" : "Actor"}</th>
            <th className="px-2 py-1.5 font-medium">{ko ? "원천 거래" : "Source"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const signed =
              kind === "coin"
                ? Math.trunc(Number(row.amount) || 0)
                : (String(row.direction ?? "").toLowerCase() === "debit" ? -1 : 1) *
                  Math.abs(Math.trunc(Number(row.amountMinor) || 0));
            const after = Math.trunc(Number(kind === "coin" ? row.balanceAfter : row.balanceAfterMinor) || 0);
            const actor = String(row.actorType ?? "system");
            return (
              <tr key={row.id} className="border-b border-sam-border-soft" data-admin-ledger-row={row.id}>
                <td className="px-2 py-1.5"><AdminTechId id={row.id} /></td>
                <td className="whitespace-nowrap px-2 py-1.5 text-sam-muted">{formatAdminManilaDateTime(row.createdAt)}</td>
                <td className="px-2 py-1.5">{financeTypeLabel(row.entryKind, ko)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-sam-muted">{fmt(after - signed)}</td>
                <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${signed < 0 ? "text-sam-danger" : "text-sam-success"}`}>
                  {signed === 0 ? fmt(0) : signedText(signed)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(after)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-sam-muted">
                  {actor === "admin" ? (ko ? "관리자" : "Admin") : actor === "owner" ? (ko ? "사장님" : "Owner") : ko ? "시스템" : "System"}
                  {row.actorUserId ? (
                    <>
                      {" "}
                      <AdminTechId id={row.actorUserId} />
                    </>
                  ) : null}
                </td>
                <td className="max-w-[240px] px-2 py-1.5 text-sam-muted">
                  <span className="block truncate">
                    {financeRelatedTargetLabel({ relatedType: row.relatedType ?? null, relatedId: row.relatedId ?? null }, ko)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

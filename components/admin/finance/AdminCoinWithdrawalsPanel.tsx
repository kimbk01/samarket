"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { financeStoreHref } from "@/lib/finance/routes";
import { financeStatusLabel, formatFinanceAmount } from "@/lib/finance/presentation";

type WithdrawalRow = {
  id: string;
  store_id: string;
  owner_user_id?: string | null;
  amount: number;
  status: string;
  destination_type: string;
  account_name: string;
  account_number?: string | null;
  bank_name?: string | null;
  source_kind?: string | null;
  created_at: string;
  paid_at?: string | null;
  paid_by?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  approved_by?: string | null;
};

type PendingAct = { requestId: string; action: "reject" | "mark_paid"; amount: number };

/**
 * Coin withdrawal ops list — reject | mark_paid only (no approve invent).
 */
export function AdminCoinWithdrawalsPanel() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`/api/admin/coin-withdrawals?${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; requests?: WithdrawalRow[] };
      if (res.ok && json.ok) setRows(json.requests ?? []);
      else
        setError(
          safeT("admin_store_finance_withdrawals_load_failed", {
            fallbackKo: "Coin 출금 요청을 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load Coin withdrawal requests.",
          })
        );
    } catch {
      setError(
        safeT("common_network_error", {
          fallbackKo: "네트워크 오류가 발생했습니다.",
          fallbackEn: "A network error occurred.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [safeT, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (requestId: string, action: "reject" | "mark_paid") => {
    setBusyId(requestId);
    setError("");
    try {
      const res = await fetch("/api/admin/coin-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId }),
      });
      if (!res.ok) {
        setError(
          safeT("admin_store_finance_withdrawals_action_failed", {
            fallbackKo: "Coin 출금 요청 처리에 실패했습니다.",
            fallbackEn: "Couldn’t process the Coin withdrawal.",
          })
        );
        return;
      }
      setPending(null);
      await load();
    } catch {
      setError(
        safeT("common_network_error", {
          fallbackKo: "네트워크 오류가 발생했습니다.",
          fallbackEn: "A network error occurred.",
        })
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3" data-admin-coin-withdrawals-panel="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CurrencyBadge currency="coin" />
          <h2 className="text-base font-semibold text-sam-fg">
            {safeT("admin_store_finance_withdrawals", {
              fallbackKo: "Coin 출금 요청",
              fallbackEn: "Coin withdrawal requests",
            })}
          </h2>
        </div>
        <label className="sam-text-helper">
          <span className="text-sam-muted">{ko ? "상태" : "Status"}</span>
          <select
            className="ml-2 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-finance-withdrawal-status-filter="1"
          >
            <option value="REQUESTED">{ko ? "신청" : "Requested"}</option>
            <option value="PAID">{ko ? "지급 완료" : "Paid"}</option>
            <option value="REJECTED">{ko ? "반려" : "Rejected"}</option>
            <option value="all">{ko ? "전체" : "All"}</option>
          </select>
        </label>
      </div>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "CTA: 출금 반려 · 지급 완료만. 승인(approve) writer는 없습니다. Cash 출금은 없습니다."
          : "CTAs: reject · mark paid only. No approve writer. Cash withdrawal does not exist."}
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_store_finance_withdrawals_empty", {
            fallbackKo: "해당 상태의 출금 요청이 없습니다.",
            fallbackEn: "No withdrawal requests for this status.",
          })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[56rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "요청일" : "Requested"}</th>
                <th className="px-3 py-2">{ko ? "매장" : "Store"}</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">{ko ? "Requested Coin" : "Requested Coin"}</th>
                <th className="px-3 py-2">{ko ? "Payout" : "Payout"}</th>
                <th className="px-3 py-2">{ko ? "Currency" : "Currency"}</th>
                <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2">{ko ? "처리일" : "Processed"}</th>
                <th className="px-3 py-2">{ko ? "Admin Actor" : "Admin actor"}</th>
                <th className="px-3 py-2">{ko ? "Reference" : "Reference"}</th>
                <th className="px-3 py-2">{ko ? "작업" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {rows.map((r) => {
                const payoutLabel =
                  r.destination_type === "gcash"
                    ? `GCash · ${r.account_name}`
                    : `${r.bank_name || "Bank"} · ${r.account_name}`;
                const adminActor = r.paid_by || r.rejected_by || r.approved_by || null;
                return (
                  <tr key={r.id} data-finance-withdrawal-row={r.id}>
                    <td className="px-3 py-2 sam-text-xxs whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={financeStoreHref(r.store_id)}
                        className="font-mono text-xs font-semibold text-signature hover:underline"
                      >
                        {r.store_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.owner_user_id ? `${r.owner_user_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold">
                      {formatFinanceAmount({ wallet: "COIN", amount: r.amount })}
                    </td>
                    <td className="px-3 py-2 sam-text-xxs">{payoutLabel}</td>
                    <td className="px-3 py-2">Coin</td>
                    <td className="px-3 py-2">{financeStatusLabel(r.status, ko)}</td>
                    <td className="px-3 py-2 sam-text-xxs">
                      {r.paid_at
                        ? new Date(r.paid_at).toLocaleString()
                        : r.rejected_at
                          ? new Date(r.rejected_at).toLocaleString()
                          : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" data-finance-withdrawal-admin-actor="1">
                      {adminActor ? `${adminActor.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                    <td className="px-3 py-2">
                      {String(r.status).toUpperCase() === "REQUESTED" ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            className="rounded-ui-rect border border-sam-border px-2 py-1 text-xs font-semibold"
                            onClick={() =>
                              setPending({ requestId: r.id, action: "reject", amount: r.amount })
                            }
                            data-finance-cta="reject-withdrawal"
                          >
                            {safeT("admin_store_finance_withdrawals_reject", {
                              fallbackKo: "출금 반려",
                              fallbackEn: "Reject withdrawal",
                            })}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            className="rounded-ui-rect bg-[var(--currency-coin-accent)] px-2 py-1 text-xs font-semibold text-white"
                            onClick={() =>
                              setPending({ requestId: r.id, action: "mark_paid", amount: r.amount })
                            }
                            data-finance-cta="mark-withdrawal-paid"
                          >
                            {safeT("admin_store_finance_withdrawals_paid", {
                              fallbackKo: "출금 지급 완료",
                              fallbackEn: "Mark withdrawal paid",
                            })}
                          </button>
                        </div>
                      ) : (
                        <span className="sam-text-xxs text-sam-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="sam-text-xxs text-sam-muted" data-finance-withdrawal-admin-actor="note">
        {ko
          ? "Admin actor = paid_by / rejected_by / approved_by (canonical request columns)."
          : "Admin actor = paid_by / rejected_by / approved_by (canonical request columns)."}
      </p>

      <AdminActionConfirmDialog
        open={!!pending}
        title={
          pending?.action === "reject"
            ? ko
              ? "출금을 반려하시겠습니까?"
              : "Reject this withdrawal?"
            : ko
              ? "출금 지급을 완료 처리하시겠습니까?"
              : "Mark this withdrawal as paid?"
        }
        description={
          pending
            ? ko
              ? `${pending.amount.toLocaleString()} Coin 출금 요청을 ${pending.action === "reject" ? "반려" : "지급 완료"}합니다.`
              : `${pending.amount.toLocaleString()} Coin withdrawal will be ${pending.action === "reject" ? "rejected" : "marked paid"}.`
            : ""
        }
        confirmLabel={
          pending?.action === "reject"
            ? ko
              ? "출금 반려"
              : "Reject withdrawal"
            : ko
              ? "출금 지급 완료"
              : "Mark paid"
        }
        cancelLabel={ko ? "취소" : "Cancel"}
        pending={busyId === pending?.requestId}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          void act(pending.requestId, pending.action);
        }}
      />
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";

type WithdrawalRow = {
  id: string;
  store_id: string;
  amount: number;
  status: string;
  destination_type: string;
  account_name: string;
  created_at: string;
};

type PendingAct = { requestId: string; action: "reject" | "mark_paid"; amount: number };

export function AdminCoinWithdrawalsPanel() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/coin-withdrawals?status=REQUESTED", { cache: "no-store" });
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
  }, [safeT]);

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
    <section className="rounded-ui-rect border border-[var(--currency-coin-border)] bg-[var(--currency-coin-bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CurrencyBadge currency="coin" />
        <h2 className="text-base font-semibold text-sam-fg">
          {safeT("admin_store_finance_withdrawals", {
            fallbackKo: "Coin 출금 요청",
            fallbackEn: "Coin withdrawal requests",
          })}
        </h2>
      </div>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_store_finance_withdrawals_empty", {
            fallbackKo: "대기 중인 출금 요청이 없습니다.",
            fallbackEn: "No pending withdrawal requests.",
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-sam-fg">
                  {r.amount.toLocaleString()} Coin · {r.destination_type}
                </p>
                <p className="sam-text-xxs text-sam-muted">{r.account_name}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="rounded-ui-rect border border-sam-border px-2 py-1 text-xs font-semibold"
                  onClick={() => setPending({ requestId: r.id, action: "reject", amount: r.amount })}
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
                  onClick={() => setPending({ requestId: r.id, action: "mark_paid", amount: r.amount })}
                  data-finance-cta="mark-withdrawal-paid"
                >
                  {safeT("admin_store_finance_withdrawals_paid", {
                    fallbackKo: "출금 지급 완료",
                    fallbackEn: "Mark withdrawal paid",
                  })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

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

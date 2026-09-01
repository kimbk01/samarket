"use client";

import { useCallback, useEffect, useState } from "react";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type WithdrawalRow = {
  id: string;
  store_id: string;
  amount: number;
  status: string;
  destination_type: string;
  account_name: string;
  created_at: string;
};

export function AdminCoinWithdrawalsPanel() {
  const { safeT } = useI18n();
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/coin-withdrawals?status=REQUESTED", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; requests?: WithdrawalRow[] };
      if (res.ok && json.ok) setRows(json.requests ?? []);
      else setError(
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
                  onClick={() => void act(r.id, "reject")}
                >
                  {safeT("admin_store_finance_withdrawals_reject", {
                    fallbackKo: "거절",
                    fallbackEn: "Reject",
                  })}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="rounded-ui-rect bg-[var(--currency-coin-accent)] px-2 py-1 text-xs font-semibold text-white"
                  onClick={() => void act(r.id, "mark_paid")}
                >
                  {safeT("admin_store_finance_withdrawals_paid", {
                    fallbackKo: "지급 완료",
                    fallbackEn: "Mark paid",
                  })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

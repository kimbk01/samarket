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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coin-withdrawals?status=REQUESTED", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; requests?: WithdrawalRow[] };
      if (json.ok) setRows(json.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (requestId: string, action: "reject" | "mark_paid") => {
    setBusyId(requestId);
    try {
      await fetch("/api/admin/coin-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-ui-rect border border-[var(--currency-coin-border)] bg-[var(--currency-coin-bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CurrencyBadge currency="coin" />
        <h2 className="text-base font-semibold text-sam-fg">
          Coin withdrawal requests
        </h2>
      </div>
      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          No pending withdrawal requests.
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
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="rounded-ui-rect bg-[var(--currency-coin-accent)] px-2 py-1 text-xs font-semibold text-white"
                  onClick={() => void act(r.id, "mark_paid")}
                >
                  Mark paid
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

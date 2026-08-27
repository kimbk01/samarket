"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type Obligation = {
  id: string;
  storeId: string;
  storeName: string;
  redemptionId: string | null;
  publicGiftNumber: string | null;
  orderId: string | null;
  linkage: "REDEMPTION" | "POOL_LEVEL";
  amountOriginal: number;
  amountRemaining: number;
  recoveredAmount: number;
  status: string;
  storeCashBalance: number;
  createdAt: string;
  clearedAt: string | null;
};

function dt(v: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export function AdminGiftRecoveryPanel({ id }: { id: string }) {
  const { safeT } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<Obligation[]>([]);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/gift-certificates/recovery", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; obligations?: Obligation[] };
      if (!res.ok || !json.ok) {
        setState("error");
        return;
      }
      const list = json.obligations ?? [];
      setRows(list);
      setState(list.length === 0 ? "empty" : "data");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows.find((r) => r.id === id) ?? null;

  const clear = async () => {
    if (!id || busy) return;
    const amt = Math.trunc(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(
        safeT("gift_ops_recovery_amount_required", {
          fallbackKo: "처리 금액을 입력하세요.",
          fallbackEn: "Enter a clear amount.",
        })
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/gift-certificates/recovery", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligationId: id, amount: amt }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_ops_recovery_fail", {
            fallbackKo: "Recovery 처리에 실패했습니다.",
            fallbackEn: "Couldn’t clear recovery.",
          })
        );
        return;
      }
      setAmount("");
      await load();
      router.push(buildAdminGiftOpsHref({ tab: "recovery" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-gift-recovery-ops="1">
      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_recovery_error", {
              fallbackKo: "Recovery를 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load recovery obligations.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_u6_recovery_empty", {
            fallbackKo: "열린 recovery obligation이 없습니다.",
            fallbackEn: "No open recovery obligations.",
          })}
        </p>
      ) : null}

      {state === "data" ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Gift # / Order</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Recovered</th>
                  <th className="px-2 py-2">Remaining</th>
                  <th className="px-2 py-2">Store Cash</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border/60">
                    <td className="px-2 py-2 font-semibold">{r.storeName || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.amountOriginal)}</td>
                    <td className="px-2 py-2">{r.linkage === "POOL_LEVEL" ? "POOL LEVEL" : "REDEMPTION"}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.linkage === "POOL_LEVEL"
                        ? "—"
                        : `${r.publicGiftNumber || "—"} / ${r.orderId ? r.orderId.slice(0, 8) : "—"}`}
                    </td>
                    <td className="px-2 py-2">{r.status}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.recoveredAmount)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.amountRemaining)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.storeCashBalance)}</td>
                    <td className="px-2 py-2 text-xs">{dt(r.createdAt)}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={buildAdminGiftOpsHref({ tab: "recovery", extra: { id: r.id } })}
                        className={`${Sam.btn.secondary} inline-flex min-h-[36px] items-center px-3 text-xs`}
                      >
                        {safeT("gift_ops_cta_process", { fallbackKo: "처리", fallbackEn: "Process" })}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <p className="font-semibold">{r.storeName}</p>
                <p className="text-sm tabular-nums">
                  {formatMoneyPhp(r.amountRemaining)} remaining · {r.linkage === "POOL_LEVEL" ? "POOL LEVEL" : r.publicGiftNumber}
                </p>
                <Link
                  href={buildAdminGiftOpsHref({ tab: "recovery", extra: { id: r.id } })}
                  className={`${Sam.btn.secondary} mt-2 flex min-h-[40px] items-center justify-center`}
                >
                  {safeT("gift_ops_cta_process", { fallbackKo: "처리", fallbackEn: "Process" })}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {selected ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <button
            type="button"
            className="text-sm font-semibold text-signature underline"
            onClick={() => router.push(buildAdminGiftOpsHref({ tab: "recovery" }))}
          >
            ← {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <p className="font-semibold">{selected.storeName}</p>
          <p className="text-sm">
            {selected.linkage === "POOL_LEVEL" ? "POOL LEVEL" : `Gift ${selected.publicGiftNumber}`} ·{" "}
            {selected.status}
          </p>
          <p className="text-sm tabular-nums">
            Remaining {formatMoneyPhp(selected.amountRemaining)} · Store Cash{" "}
            {formatMoneyPhp(selected.storeCashBalance)}
          </p>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(selected.amountRemaining)}
          />
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[44px] w-full`}
            disabled={busy}
            onClick={() => void clear()}
          >
            {safeT("gift_ops_recovery_clear", { fallbackKo: "Recovery 처리", fallbackEn: "Clear recovery" })}
          </button>
          <details className="text-xs text-sam-muted">
            <summary>
              {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
            </summary>
            <p className="break-all font-mono">{selected.id}</p>
          </details>
        </section>
      ) : null}
    </div>
  );
}

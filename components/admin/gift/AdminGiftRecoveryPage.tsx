"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatMoneyPhp } from "@/lib/utils/format";

type Obligation = {
  id: string;
  storeId: string;
  storeName: string;
  redemptionId: string | null;
  amountOriginal: number;
  amountRemaining: number;
  status: string;
  createdAt: string;
};

export function AdminGiftRecoveryPage() {
  const { safeT } = useI18n();
  const [rows, setRows] = useState<Obligation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/gift-certificates/recovery", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; obligations?: Obligation[] };
    setRows(json.ok ? json.obligations ?? [] : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-recovery="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {safeT("gift_u6_recovery_title", {
            fallbackKo: "Store Cash Recovery",
            fallbackEn: "Store Cash Recovery",
          })}
        </h1>
        <Link href="/admin/gift-certificates/conversions" className="text-sm font-semibold text-signature underline">
          {safeT("gift_u6_nav_conversions", {
            fallbackKo: "환전/전환 요청",
            fallbackEn: "Cash conversion requests",
          })}
        </Link>
      </div>
      {!loaded ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_u6_recovery_empty", {
            fallbackKo: "열린 recovery obligation이 없습니다.",
            fallbackEn: "No open recovery obligations.",
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-recovery-id={r.id}>
              <p className="text-sm font-semibold truncate">{r.storeName || r.storeId}</p>
              <p className="mt-1 text-xs font-mono break-all">{r.redemptionId ?? "—"}</p>
              <p className="mt-1 text-xs tabular-nums">
                {safeT("gift_u6_recovery_original", { fallbackKo: "원금", fallbackEn: "Original" })}:{" "}
                {formatMoneyPhp(r.amountOriginal)}
              </p>
              <p className="text-xs tabular-nums">
                {safeT("gift_u6_recovery_remaining", { fallbackKo: "잔여", fallbackEn: "Remaining" })}:{" "}
                {formatMoneyPhp(r.amountRemaining)}
              </p>
              <p className="mt-1 text-xs text-sam-muted">{r.status}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

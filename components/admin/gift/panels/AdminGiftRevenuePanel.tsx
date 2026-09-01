"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type RevenueSummary = {
  pendingGross: number;
  pendingPlatformFee: number;
  pendingMerchantNet: number;
  recognizedGross: number;
  recognizedPlatformFee: number;
  recognizedMerchantNet: number;
  outstandingGiftValue: number;
  details?: Array<{
    storeName: string;
    publicGiftNumber: string;
    giftScope?: "STORE" | "PLATFORM";
    instanceId: string;
    orderNo: string | null;
    orderId: string;
    gross: number;
    platformFee: number;
    merchantNet: number;
    recognitionState: string;
    recognizedAt: string | null;
    orderStatus: string | null;
  }>;
};

type StoreRow = {
  storeId: string;
  storeName: string;
  ownerLabel: string;
  redeemedGross: number;
  pendingMerchantNet: number;
  recognizedMerchantNet: number;
  availableRevenue: number;
  cashOutHold: number;
  cashOutRequested: number;
  cashOutPaid: number;
  storeCashConversionPending: number;
  storeCashConverted: number;
  storeCashBalance: number;
  openRecoveryAmount: number;
};

type StoreDetail = StoreRow & {
  adminValue: Record<string, number>;
  ownerValue: Record<string, number>;
  parityOk: boolean;
};

function kpi(label: string, value: number, testId: string) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-gift-kpi={testId}>
      <p className="text-xs text-sam-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{formatMoneyPhp(value)}</p>
    </div>
  );
}

export function AdminGiftRevenuePanel({ storeId }: { storeId: string }) {
  const { safeT } = useI18n();
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [revRes, storesRes, detailRes] = await Promise.all([
        fetch("/api/admin/gift-certificates/revenue?detail=1", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/gift-certificates/stores", {
          credentials: "include",
          cache: "no-store",
        }),
        storeId
          ? fetch(`/api/admin/gift-certificates/stores?storeId=${encodeURIComponent(storeId)}`, {
              credentials: "include",
              cache: "no-store",
            })
          : Promise.resolve(null),
      ]);
      const revJson = (await revRes.json()) as { ok?: boolean } & Partial<RevenueSummary>;
      const storesJson = (await storesRes.json()) as { ok?: boolean; stores?: StoreRow[] };
      if (!revRes.ok || !revJson.ok || !storesRes.ok || !storesJson.ok) {
        setState("error");
        return;
      }
      setSummary({
        pendingGross: Math.trunc(Number(revJson.pendingGross) || 0),
        pendingPlatformFee: Math.trunc(Number(revJson.pendingPlatformFee) || 0),
        pendingMerchantNet: Math.trunc(Number(revJson.pendingMerchantNet) || 0),
        recognizedGross: Math.trunc(Number(revJson.recognizedGross) || 0),
        recognizedPlatformFee: Math.trunc(Number(revJson.recognizedPlatformFee) || 0),
        recognizedMerchantNet: Math.trunc(Number(revJson.recognizedMerchantNet) || 0),
        outstandingGiftValue: Math.trunc(Number(revJson.outstandingGiftValue) || 0),
        details: revJson.details ?? [],
      });
      setStores(storesJson.stores ?? []);
      if (detailRes) {
        const dJson = (await detailRes.json()) as { ok?: boolean; store?: StoreDetail };
        setDetail(dJson.ok && dJson.store ? dJson.store : null);
      } else {
        setDetail(null);
      }
      setState((storesJson.stores ?? []).length === 0 && !(revJson.details ?? []).length ? "empty" : "data");
    } catch {
      setState("error");
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6" data-admin-gift-revenue-ops="1">
      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_rev_error", {
              fallbackKo: "정산·수익을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load revenue settlement.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}

      {summary ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sam-muted">PENDING</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {kpi("Pending Gross", summary.pendingGross, "pending-gross")}
              {kpi("Pending Platform Fee", summary.pendingPlatformFee, "pending-fee")}
              {kpi("Pending Merchant Net", summary.pendingMerchantNet, "pending-net")}
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sam-muted">RECOGNIZED</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {kpi("Recognized Gross", summary.recognizedGross, "rec-gross")}
              {kpi("Platform Revenue", summary.recognizedPlatformFee, "rec-fee")}
              {kpi("Merchant Net", summary.recognizedMerchantNet, "rec-net")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {kpi("Outstanding Gift Value", summary.outstandingGiftValue, "outstanding")}
            </div>
            <p className="text-xs text-sam-muted">
              {safeT("gift_ops_rev_note", {
                fallbackKo: "확정 Platform Fee만 DIBAY 수익입니다. Outstanding는 부채이며 매출이 아닙니다.",
                fallbackEn: "Only recognized Platform Fee is DIBAY revenue. Outstanding is liability, not sales.",
              })}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">
              {safeT("gift_ops_rev_rows", { fallbackKo: "수익 상세", fallbackEn: "Revenue detail rows" })}
            </h2>
            {(summary.details ?? []).length === 0 ? (
              <p className="text-sm text-sam-muted">—</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-sam-border text-xs text-sam-muted">
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Store</th>
                      <th className="px-2 py-2">Gift #</th>
                      <th className="px-2 py-2">Order</th>
                      <th className="px-2 py-2">Gross</th>
                      <th className="px-2 py-2">Fee</th>
                      <th className="px-2 py-2">Net</th>
                      <th className="px-2 py-2">State</th>
                      <th className="px-2 py-2">Recognized At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.details ?? []).slice(0, 200).map((r, i) => (
                      <tr key={`${r.orderId}-${i}`} className="border-b border-sam-border/60">
                        <td className="px-2 py-2 text-xs">
                          {r.giftScope === "PLATFORM" ? "DIBAY" : "STORE"}
                        </td>
                        <td className="px-2 py-2">{r.storeName}</td>
                        <td className="px-2 py-2 font-mono text-xs">{r.publicGiftNumber || "—"}</td>
                        <td className="px-2 py-2">{r.orderNo || r.orderId.slice(0, 8)}</td>
                        <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.gross)}</td>
                        <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.platformFee)}</td>
                        <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.merchantNet)}</td>
                        <td className="px-2 py-2 uppercase">{r.recognitionState}</td>
                        <td className="px-2 py-2 text-xs text-sam-muted">
                          {r.recognizedAt ? new Date(r.recognizedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {safeT("gift_ops_store_settle", { fallbackKo: "매장 정산", fallbackEn: "Store settlement" })}
        </h2>
        {state === "empty" ? (
          <p className="text-sm text-sam-muted">
            {safeT("gift_ops_store_empty", {
              fallbackKo: "상품권을 판매 중인 매장이 없습니다.",
              fallbackEn: "No stores selling gift certificates.",
            })}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-sam-border text-xs text-sam-muted">
                <th className="px-2 py-2">Store</th>
                <th className="px-2 py-2">Owner</th>
                <th className="px-2 py-2">Gross</th>
                <th className="px-2 py-2">Pending Net</th>
                <th className="px-2 py-2">Recognized Net</th>
                <th className="px-2 py-2">Available</th>
                <th className="px-2 py-2">Cash-out</th>
                <th className="px-2 py-2">Historical converted amount</th>
                <th className="px-2 py-2">Recovery</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeId} className="border-b border-sam-border/60" data-store-id={s.storeId}>
                  <td className="px-2 py-2 font-semibold">{s.storeName || "—"}</td>
                  <td className="px-2 py-2">{s.ownerLabel || "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(s.redeemedGross)}</td>
                  <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(s.pendingMerchantNet)}</td>
                  <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(s.recognizedMerchantNet)}</td>
                  <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(s.availableRevenue)}</td>
                  <td className="px-2 py-2 text-xs">
                    req {formatMoneyPhp(s.cashOutRequested)} / paid {formatMoneyPhp(s.cashOutPaid)}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    pend {formatMoneyPhp(s.storeCashConversionPending)} / bal{" "}
                    {formatMoneyPhp(s.storeCashBalance)}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(s.openRecoveryAmount)}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildAdminGiftOpsHref({
                        tab: "revenue",
                        extra: { storeId: s.storeId },
                      })}
                      className={`${Sam.btn.secondary} inline-flex min-h-[36px] items-center px-3 text-xs`}
                    >
                      {safeT("gift_ops_cta_store", { fallbackKo: "매장 상세", fallbackEn: "Store detail" })}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-gift-store-parity="1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">
              {detail.storeName} · {detail.ownerLabel}
            </h3>
            <Link href={buildAdminGiftOpsHref({ tab: "revenue" })} className={`${Sam.btn.secondary} min-h-[36px] px-3 text-sm`}>
              {safeT("gift_ops_close_detail", { fallbackKo: "닫기", fallbackEn: "Close" })}
            </Link>
          </div>
          <p className={`text-sm font-semibold ${detail.parityOk ? "text-green-700" : "text-red-600"}`}>
            {detail.parityOk
              ? safeT("gift_ops_parity_ok", {
                  fallbackKo: "ADMIN == OWNER (동일 canonical 값)",
                  fallbackEn: "ADMIN == OWNER (same canonical values)",
                })
              : safeT("gift_ops_parity_fail", {
                  fallbackKo: "Parity mismatch — 조사 필요",
                  fallbackEn: "Parity mismatch — investigate",
                })}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase text-sam-muted">ADMIN</h4>
              <ul className="mt-1 space-y-1 text-sm tabular-nums">
                {Object.entries(detail.adminValue).map(([k, v]) => (
                  <li key={k}>
                    {k}: {formatMoneyPhp(v)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-sam-muted">OWNER</h4>
              <ul className="mt-1 space-y-1 text-sm tabular-nums">
                {Object.entries(detail.ownerValue).map(([k, v]) => (
                  <li key={k}>
                    {k}: {formatMoneyPhp(v)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <details className="text-xs text-sam-muted">
            <summary>
              {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
            </summary>
            <p className="mt-1 break-all font-mono">{detail.storeId}</p>
          </details>
        </section>
      ) : null}
    </div>
  );
}

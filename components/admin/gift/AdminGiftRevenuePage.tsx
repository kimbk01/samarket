"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatMoneyPhp } from "@/lib/utils/format";

type Revenue = {
  redeemedGross: number;
  platformFee: number;
  merchantNet: number;
  pendingGross: number;
  pendingPlatformFee: number;
  pendingMerchantNet: number;
  recognizedGross: number;
  recognizedPlatformFee: number;
  recognizedMerchantNet: number;
  outstandingGiftValue: number;
  storeCashTotal: number;
};

export function AdminGiftRevenuePage() {
  const { safeT } = useI18n();
  const [data, setData] = useState<Revenue | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/gift-certificates/revenue", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean } & Partial<Revenue>;
    if (json.ok) {
      setData({
        redeemedGross: Math.trunc(Number(json.redeemedGross) || 0),
        platformFee: Math.trunc(Number(json.platformFee) || 0),
        merchantNet: Math.trunc(Number(json.merchantNet) || 0),
        pendingGross: Math.trunc(Number(json.pendingGross) || 0),
        pendingPlatformFee: Math.trunc(Number(json.pendingPlatformFee) || 0),
        pendingMerchantNet: Math.trunc(Number(json.pendingMerchantNet) || 0),
        recognizedGross: Math.trunc(Number(json.recognizedGross) || 0),
        recognizedPlatformFee: Math.trunc(Number(json.recognizedPlatformFee) || 0),
        recognizedMerchantNet: Math.trunc(Number(json.recognizedMerchantNet) || 0),
        outstandingGiftValue: Math.trunc(Number(json.outstandingGiftValue) || 0),
        storeCashTotal: Math.trunc(Number(json.storeCashTotal) || 0),
      });
    } else {
      setData(null);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = (label: string, value: number, testId: string) => (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-gift-kpi={testId}>
      <p className="text-xs text-sam-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums break-words">{formatMoneyPhp(value)}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-revenue="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {safeT("gift_u6_revenue_title", {
            fallbackKo: "상품권 Platform Revenue",
            fallbackEn: "Gift Platform Revenue",
          })}
        </h1>
        <Link href="/admin/gift-certificates/conversions" className="text-sm font-semibold text-signature underline">
          {safeT("gift_u6_nav_conversions", {
            fallbackKo: "Store Cash 전환 요청",
            fallbackEn: "Store Cash conversion requests",
          })}
        </Link>
        <Link href="/admin/gift-certificates/cash-outs" className="ml-3 text-sm font-semibold text-signature underline">
          {safeT("gift_admin_cash_out_title", {
            fallbackKo: "상품권 환전 요청",
            fallbackEn: "Gift cash-out requests",
          })}
        </Link>
      </div>
      {!loaded || !data ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">Pending</p>
          <div className="grid grid-cols-2 gap-2" data-admin-gift-pending="1">
            {card(
              safeT("gift_u6_kpi_pending_gross", { fallbackKo: "Pending Gross", fallbackEn: "Pending Gross" }),
              data.pendingGross,
              "pending-gross"
            )}
            {card(
              safeT("gift_u6_kpi_pending_fee", {
                fallbackKo: "Pending Platform Fee",
                fallbackEn: "Pending Platform Fee",
              }),
              data.pendingPlatformFee,
              "pending-fee"
            )}
            {card(
              safeT("gift_u6_kpi_pending_merchant", {
                fallbackKo: "Pending Merchant Net",
                fallbackEn: "Pending Merchant Net",
              }),
              data.pendingMerchantNet,
              "pending-merchant"
            )}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">Recognized</p>
          <div className="grid grid-cols-2 gap-2" data-admin-gift-recognized="1">
            {card(
              safeT("gift_u6_kpi_recognized_gross", {
                fallbackKo: "Recognized Gross",
                fallbackEn: "Recognized Gross",
              }),
              data.recognizedGross,
              "recognized-gross"
            )}
            {card(
              safeT("gift_u6_kpi_fee", { fallbackKo: "Platform Fee (recognized)", fallbackEn: "Platform Fee (recognized)" }),
              data.platformFee,
              "fee"
            )}
            {card(
              safeT("gift_u6_kpi_merchant", {
                fallbackKo: "Merchant Net (recognized)",
                fallbackEn: "Merchant Net (recognized)",
              }),
              data.merchantNet,
              "merchant"
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {card(
              safeT("gift_u6_kpi_gross", { fallbackKo: "Redeemed Gross", fallbackEn: "Redeemed Gross" }),
              data.redeemedGross,
              "gross"
            )}
            {card(
              safeT("gift_u6_kpi_outstanding", {
                fallbackKo: "Outstanding Gift Value",
                fallbackEn: "Outstanding Gift Value",
              }),
              data.outstandingGiftValue,
              "outstanding"
            )}
            {card(
              safeT("gift_u6_kpi_store_cash_total", {
                fallbackKo: "Store Cash (합계)",
                fallbackEn: "Store Cash (total)",
              }),
              data.storeCashTotal,
              "store-cash"
            )}
          </div>
          <p className="text-xs text-sam-muted">
            {safeT("gift_u6_revenue_hint", {
              fallbackKo:
                "확정 Platform Fee만 DIBAY 수익입니다. Pending은 주문 완료 전까지 확정 수익에 포함되지 않습니다.",
              fallbackEn:
                "Only recognized Platform Fee counts as DIBAY revenue. Pending amounts are excluded until the order completes.",
            })}
          </p>
        </>
      )}
    </div>
  );
}

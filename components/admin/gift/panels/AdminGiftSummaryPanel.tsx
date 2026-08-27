"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type Summary = {
  range: string;
  activeProducts: number;
  issuedInstances: number;
  outstandingGiftValue: number;
  giftLockedCount: number;
  redeemedGross: number;
  pendingGross: number;
  pendingPlatformFee: number;
  recognizedPlatformFee: number;
  recognizedMerchantNet: number;
  cashOutPendingCount: number;
  storeCashConversionPendingCount: number;
  openRecoveryCount: number;
};

const RANGES = ["all", "today", "7d", "30d"] as const;

function fmtCount(n: number): string {
  return Math.trunc(n || 0).toLocaleString();
}

export function AdminGiftSummaryPanel({ range }: { range: string }) {
  const { safeT } = useI18n();
  const activeRange = (RANGES as readonly string[]).includes(range) ? range : "all";
  const [data, setData] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(
        `/api/admin/gift-certificates/ops-summary?range=${encodeURIComponent(activeRange)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean } & Partial<Summary>;
      if (!res.ok || !json.ok) {
        setData(null);
        setState("error");
        return;
      }
      const next: Summary = {
        range: String(json.range ?? activeRange),
        activeProducts: Math.trunc(Number(json.activeProducts) || 0),
        issuedInstances: Math.trunc(Number(json.issuedInstances) || 0),
        outstandingGiftValue: Math.trunc(Number(json.outstandingGiftValue) || 0),
        giftLockedCount: Math.trunc(Number(json.giftLockedCount) || 0),
        redeemedGross: Math.trunc(Number(json.redeemedGross) || 0),
        pendingGross: Math.trunc(Number(json.pendingGross) || 0),
        pendingPlatformFee: Math.trunc(Number(json.pendingPlatformFee) || 0),
        recognizedPlatformFee: Math.trunc(Number(json.recognizedPlatformFee) || 0),
        recognizedMerchantNet: Math.trunc(Number(json.recognizedMerchantNet) || 0),
        cashOutPendingCount: Math.trunc(Number(json.cashOutPendingCount) || 0),
        storeCashConversionPendingCount: Math.trunc(
          Number(json.storeCashConversionPendingCount) || 0
        ),
        openRecoveryCount: Math.trunc(Number(json.openRecoveryCount) || 0),
      };
      setData(next);
      setState(
        next.activeProducts === 0 && next.issuedInstances === 0 ? "empty" : "data"
      );
    } catch {
      setData(null);
      setState("error");
    }
  }, [activeRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = (label: string, value: string, testId: string) => (
    <div
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-admin-gift-kpi={testId}
    >
      <p className="text-xs text-sam-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums break-words">{value}</p>
    </div>
  );

  return (
    <section className="space-y-4" data-admin-gift-summary-panel="1">
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={buildAdminGiftOpsHref({ tab: "summary", extra: { range: r } })}
            className={[
              "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
              activeRange === r
                ? "bg-sam-fg text-sam-app"
                : "border border-sam-border bg-sam-surface",
            ].join(" ")}
            data-admin-gift-range={r}
          >
            {r === "all"
              ? safeT("gift_ops_range_all", { fallbackKo: "전체", fallbackEn: "All" })
              : r === "today"
                ? safeT("gift_ops_range_today", { fallbackKo: "오늘", fallbackEn: "Today" })
                : r}
          </Link>
        ))}
      </div>

      {state === "loading" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : null}

      {state === "error" ? (
        <div className="space-y-2 rounded-ui-rect border border-red-200 bg-sam-surface p-4">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_summary_error", {
              fallbackKo: "요약을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load summary.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}

      {state === "empty" && data ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_summary_empty", {
            fallbackKo: "아직 상품권 운영 데이터가 없습니다.",
            fallbackEn: "No gift operations data yet.",
          })}
        </p>
      ) : null}

      {(state === "data" || state === "empty") && data ? (
        <>
          <p className="text-xs text-sam-muted">
            {safeT("gift_ops_summary_liability_note", {
              fallbackKo:
                "Face / Outstanding는 고객 부채(liability)이며 DIBAY 수익이 아닙니다. 플랫폼 수익은 Pending/Recognized Fee를 보세요.",
              fallbackEn:
                "Face / outstanding is customer liability, not DIBAY revenue. Platform revenue is pending/recognized fee.",
            })}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {kpi(
              safeT("gift_ops_kpi_active_products", {
                fallbackKo: "활성 상품",
                fallbackEn: "Active products",
              }),
              fmtCount(data.activeProducts),
              "activeProducts"
            )}
            {kpi(
              safeT("gift_ops_kpi_issued", {
                fallbackKo: "발급 인스턴스",
                fallbackEn: "Issued instances",
              }),
              fmtCount(data.issuedInstances),
              "issuedInstances"
            )}
            {kpi(
              safeT("gift_ops_kpi_outstanding", {
                fallbackKo: "미사용 Face",
                fallbackEn: "Outstanding gift value",
              }),
              formatMoneyPhp(data.outstandingGiftValue),
              "outstandingGiftValue"
            )}
            {kpi(
              safeT("gift_ops_kpi_locked", {
                fallbackKo: "Gift Locked",
                fallbackEn: "Gift locked",
              }),
              fmtCount(data.giftLockedCount),
              "giftLockedCount"
            )}
            {kpi(
              safeT("gift_ops_kpi_redeemed_gross", {
                fallbackKo: "사용 Gross",
                fallbackEn: "Redeemed gross",
              }),
              formatMoneyPhp(data.redeemedGross),
              "redeemedGross"
            )}
            {kpi(
              safeT("gift_ops_kpi_pending_gross", {
                fallbackKo: "Pending Gross",
                fallbackEn: "Pending gross",
              }),
              formatMoneyPhp(data.pendingGross),
              "pendingGross"
            )}
            {kpi(
              safeT("gift_ops_kpi_pending_fee", {
                fallbackKo: "Pending Fee",
                fallbackEn: "Pending platform fee",
              }),
              formatMoneyPhp(data.pendingPlatformFee),
              "pendingPlatformFee"
            )}
            {kpi(
              safeT("gift_ops_kpi_recognized_fee", {
                fallbackKo: "Recognized Fee",
                fallbackEn: "Recognized platform fee",
              }),
              formatMoneyPhp(data.recognizedPlatformFee),
              "recognizedPlatformFee"
            )}
            {kpi(
              safeT("gift_ops_kpi_recognized_net", {
                fallbackKo: "Recognized Merchant Net",
                fallbackEn: "Recognized merchant net",
              }),
              formatMoneyPhp(data.recognizedMerchantNet),
              "recognizedMerchantNet"
            )}
            {kpi(
              safeT("gift_ops_kpi_cash_out_pending", {
                fallbackKo: "외부 환전 대기",
                fallbackEn: "Cash-out pending",
              }),
              fmtCount(data.cashOutPendingCount),
              "cashOutPendingCount"
            )}
            {kpi(
              safeT("gift_ops_kpi_conversion_pending", {
                fallbackKo: "Store Cash 전환 대기",
                fallbackEn: "Store cash conversion pending",
              }),
              fmtCount(data.storeCashConversionPendingCount),
              "storeCashConversionPendingCount"
            )}
            {kpi(
              safeT("gift_ops_kpi_recovery_open", {
                fallbackKo: "열린 Recovery",
                fallbackEn: "Open recovery",
              }),
              fmtCount(data.openRecoveryCount),
              "openRecoveryCount"
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

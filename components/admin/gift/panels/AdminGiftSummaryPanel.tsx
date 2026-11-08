"use client";

import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";

type ScopeKpis = {
  activeProducts: number;
  issuedInstances: number;
  outstanding: number;
  redeemedGross: number;
};

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
  storeGift?: ScopeKpis;
  platformGift?: ScopeKpis;
};

const RANGES = ["all", "today", "7d", "30d"] as const;

function fmtCount(n: number): string {
  return formatAdminNumber(Math.trunc(n || 0));
}

export function AdminGiftSummaryPanel({ range }: { range: string }) {
  const { safeT, language } = useI18n();
  const activeRange = (RANGES as readonly string[]).includes(range) ? range : "all";
  const [data, setData] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(
        `/api/admin/gift-certificates/ops-summary?range=${encodeURIComponent(activeRange)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = ((await res.json().catch(() => null)) ?? {}) as { ok?: boolean } & Partial<Summary>;
      if (!res.ok || !json.ok) {
        // 실패해도 직전 요약은 지우지 않는다 (§8-5).
        setLoadErr({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        setState("error");
        return;
      }
      setLoadErr(null);
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
        storeGift: (json as { storeGift?: ScopeKpis }).storeGift,
        platformGift: (json as { platformGift?: ScopeKpis }).platformGift,
      };
      setData(next);
      setState(
        next.activeProducts === 0 && next.issuedInstances === 0 ? "empty" : "data"
      );
    } catch {
      setLoadErr({ code: "network_error" });
      setState("error");
    }
  }, [activeRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = (label: string, value: string, testId: string, href?: string) => {
    const inner = (
      <>
        <p className="text-xs text-sam-muted">{label}</p>
        <p className="mt-1 text-base font-semibold tabular-nums break-words">{value}</p>
      </>
    );
    const className =
      "rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left transition hover:border-sam-primary/50";
    if (href) {
      return (
        <Link href={href} className={`block ${className}`} data-admin-gift-kpi={testId}>
          {inner}
        </Link>
      );
    }
    return (
      <div className={className} data-admin-gift-kpi={testId}>
        {inner}
      </div>
    );
  };

  return (
    <section className="space-y-4" data-admin-gift-summary-panel="1">
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={buildAdminGiftOpsHref({ tab: "dashboard", extra: { range: r } })}
            className={[
              "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
              activeRange === r
                ? "bg-sam-fg text-sam-app"
                : "border border-sam-border bg-sam-surface",
            ].join(" ")}
            data-admin-gift-range={r}
          >
            {r === "all"
              ? safeT("gift_ops_range_all")
              : r === "today"
                ? safeT("gift_ops_range_today")
                : r}
          </Link>
        ))}
      </div>

      {state === "loading" ? <AdminLoadingState ko={language !== "en"} /> : null}

      {state === "error" ? (
        <AdminErrorState
          ko={language !== "en"}
          code={loadErr?.code ?? "load_failed"}
          httpStatus={loadErr?.status}
          onRetry={() => void load()}
        />
      ) : null}

      {state === "empty" && data ? (
        <AdminEmptyState
          ko={language !== "en"}
          message={safeT("gift_ops_summary_empty")}
        />
      ) : null}

      {data ? (
        <>
          <p className="text-xs text-sam-muted">
            {safeT("gift_ops_summary_liability_note")}
          </p>
          {data.storeGift || data.platformGift ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2">
                <p className="text-sm font-semibold">
                  {safeT("gift_ops_type_store")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {kpi("Active", fmtCount(data.storeGift?.activeProducts ?? 0), "storeActive")}
                  {kpi("Issued", fmtCount(data.storeGift?.issuedInstances ?? 0), "storeIssued")}
                  {kpi(
                    "Outstanding",
                    formatAdminPhp(data.storeGift?.outstanding ?? 0),
                    "storeOutstanding"
                  )}
                  {kpi(
                    "Redeemed",
                    formatAdminPhp(data.storeGift?.redeemedGross ?? 0),
                    "storeRedeemed"
                  )}
                </div>
              </div>
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2">
                <p className="text-sm font-semibold">
                  {safeT("gift_ops_type_platform")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {kpi("Active", fmtCount(data.platformGift?.activeProducts ?? 0), "platActive")}
                  {kpi("Issued", fmtCount(data.platformGift?.issuedInstances ?? 0), "platIssued")}
                  {kpi(
                    "Outstanding",
                    formatAdminPhp(data.platformGift?.outstanding ?? 0),
                    "platOutstanding"
                  )}
                  {kpi(
                    "Redeemed",
                    formatAdminPhp(data.platformGift?.redeemedGross ?? 0),
                    "platRedeemed"
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {kpi(
              safeT("gift_ops_kpi_active_products"),
              fmtCount(data.activeProducts),
              "activeProducts",
              buildAdminGiftOpsHref({
                tab: "products",
                products: "products",
                extra: { status: "active" },
              })
            )}
            {kpi(
              safeT("gift_ops_kpi_issued"),
              fmtCount(data.issuedInstances),
              "issuedInstances",
              buildAdminGiftOpsHref({ tab: "instances" })
            )}
            {kpi(
              safeT("gift_ops_kpi_outstanding"),
              formatAdminPhp(data.outstandingGiftValue),
              "outstandingGiftValue",
              buildAdminGiftOpsHref({ tab: "instances", extra: { balance: "gt0" } })
            )}
            {kpi(
              safeT("gift_ops_kpi_locked"),
              fmtCount(data.giftLockedCount),
              "giftLockedCount",
              buildAdminGiftOpsHref({ tab: "instances", extra: { status: "GIFT_LOCKED" } })
            )}
            {kpi(
              safeT("gift_ops_kpi_redeemed_gross"),
              formatAdminPhp(data.redeemedGross),
              "redeemedGross",
              buildAdminGiftOpsHref({ tab: "ledger", ledger: "usage" })
            )}
            {kpi(
              safeT("gift_ops_kpi_pending_gross"),
              formatAdminPhp(data.pendingGross),
              "pendingGross",
              buildAdminGiftOpsHref({ tab: "ledger", ledger: "settlement" })
            )}
            {kpi(
              safeT("gift_ops_kpi_pending_fee"),
              formatAdminPhp(data.pendingPlatformFee),
              "pendingPlatformFee",
              buildAdminGiftOpsHref({ tab: "ledger", ledger: "settlement" })
            )}
            {kpi(
              safeT("gift_ops_kpi_recognized_fee"),
              formatAdminPhp(data.recognizedPlatformFee),
              "recognizedPlatformFee",
              buildAdminGiftOpsHref({ tab: "ledger", ledger: "settlement" })
            )}
            {kpi(
              safeT("gift_ops_kpi_recognized_net"),
              formatAdminPhp(data.recognizedMerchantNet),
              "recognizedMerchantNet",
              buildAdminGiftOpsHref({ tab: "ledger", ledger: "settlement" })
            )}
            {kpi(
              safeT("gift_ops_kpi_cash_out_pending"),
              fmtCount(data.cashOutPendingCount),
              "cashOutPendingCount",
              buildAdminGiftOpsHref({
                tab: "finance",
                finance: "external",
                extra: { status: "REQUESTED" },
              })
            )}
            {kpi(
              safeT("gift_ops_kpi_conversion_pending"),
              fmtCount(data.storeCashConversionPendingCount),
              "storeCashConversionPendingCount",
              buildAdminGiftOpsHref({
                tab: "finance",
                finance: "store-cash",
                extra: { status: "REQUESTED" },
              })
            )}
            {kpi(
              safeT("gift_ops_kpi_recovery_open"),
              fmtCount(data.openRecoveryCount),
              "openRecoveryCount",
              buildAdminGiftOpsHref({ tab: "finance", finance: "recovery" })
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

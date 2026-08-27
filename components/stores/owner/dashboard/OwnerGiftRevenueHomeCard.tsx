"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  aggregateOwnerRedemptionKpis,
  conversionPendingAmount,
  type OwnerGiftConversionRow,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import { formatMoneyPhp } from "@/lib/utils/format";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

type GiftHomeMoney = {
  recognizedMerchantNet: number;
  availableRevenue: number;
  cashOutPending: number;
  conversionPending: number;
  storeCashBalance: number;
};

function emptyMoney(): GiftHomeMoney {
  return {
    recognizedMerchantNet: 0,
    availableRevenue: 0,
    cashOutPending: 0,
    conversionPending: 0,
    storeCashBalance: 0,
  };
}

/**
 * Owner Home — Gift Revenue summary (never merged with Business Credit).
 */
export function OwnerGiftRevenueHomeCard({ storeId }: { storeId: string }) {
  const { safeT } = useI18n();
  const [money, setMoney] = useState<GiftHomeMoney>(emptyMoney);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [revRes, redRes, convRes, cashOutRes] = await Promise.all([
          fetch(`/api/me/stores/${encodeURIComponent(storeId)}/gift-certificates/revenue`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/me/stores/${encodeURIComponent(storeId)}/gift-certificates/redemptions`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/me/stores/${encodeURIComponent(storeId)}/gift-certificates/conversions`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/me/stores/${encodeURIComponent(storeId)}/gift-certificates/cash-outs`, {
            credentials: "include",
            cache: "no-store",
          }).catch(() => null),
        ]);
        const rev = revRes.ok ? await revRes.json() : null;
        const red = redRes.ok ? await redRes.json() : null;
        const conv = convRes.ok ? await convRes.json() : null;
        const cashOut = cashOutRes && cashOutRes.ok ? await cashOutRes.json() : null;
        if (cancelled) return;
        const redRows = (Array.isArray(red?.redemptions) ? red.redemptions : []) as OwnerGiftRedemptionRow[];
        const kpis = aggregateOwnerRedemptionKpis(redRows);
        const convRows = (Array.isArray(conv?.conversions) ? conv.conversions : []).map(
          (raw: Record<string, unknown>): OwnerGiftConversionRow => ({
            id: String(raw.id),
            amount: Math.trunc(Number(raw.amount) || 0),
            status: String(raw.status ?? ""),
            createdAt: String(raw.created_at ?? ""),
            approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
          })
        );
        const cashOutPending = Array.isArray(cashOut?.cashOuts)
          ? cashOut.cashOuts
              .filter((r: { status?: string }) => String(r.status).toUpperCase() === "REQUESTED")
              .reduce((s: number, r: { amount?: number }) => s + Math.max(0, Math.trunc(Number(r.amount) || 0)), 0)
          : Math.trunc(Number(cashOut?.pendingAmount) || 0);
        setMoney({
          recognizedMerchantNet: kpis.recognizedMerchantNet,
          availableRevenue: Math.trunc(Number(rev?.availableRevenue) || 0),
          cashOutPending,
          conversionPending: conversionPendingAmount(convRows),
          storeCashBalance: Math.trunc(Number(rev?.storeCashBalance) || 0),
        });
      } catch {
        if (!cancelled) setMoney(emptyMoney());
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const cells: { id: string; label: string; value: number }[] = [
    {
      id: "recognized",
      label: safeT("gift_u5_kpi_merchant_net", {
        fallbackKo: "확정 상품권 수익",
        fallbackEn: "Recognized gift revenue",
      }),
      value: money.recognizedMerchantNet,
    },
    {
      id: "available",
      label: safeT("gift_owner_kpi_revenue", {
        fallbackKo: "전환 가능 수익",
        fallbackEn: "Available gift revenue",
      }),
      value: money.availableRevenue,
    },
    {
      id: "cash-out-pending",
      label: safeT("gift_owner_kpi_cash_out_pending", {
        fallbackKo: "환전 신청 중",
        fallbackEn: "Cash-out requested",
      }),
      value: money.cashOutPending,
    },
    {
      id: "conv-pending",
      label: safeT("gift_u5_kpi_cash_pending", {
        fallbackKo: "Store Cash 전환 대기",
        fallbackEn: "Store Cash conversion pending",
      }),
      value: money.conversionPending,
    },
    {
      id: "store-cash",
      label: safeT("gift_u5_kpi_store_cash", {
        fallbackKo: "매장 Cash",
        fallbackEn: "Store Cash",
      }),
      value: money.storeCashBalance,
    },
  ];

  return (
    <section
      className={ownerDashCardClass("space-y-3")}
      aria-labelledby="owner-gift-revenue-home-title"
      data-owner-gift-home-money="1"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="owner-gift-revenue-home-title" className={ownerDashTypography.sectionTitle}>
            {safeT("gift_owner_home_money_title", {
              fallbackKo: "상품권 수익",
              fallbackEn: "Gift certificate revenue",
            })}
          </h2>
          <p className={`mt-0.5 ${ownerDashTypography.helper}`}>
            {safeT("gift_u5_money_hint_credit", {
              fallbackKo: "비즈니스 크레딧과 다른 돈입니다.",
              fallbackEn: "Separate from Business Credit.",
            })}
          </p>
        </div>
      </div>
      {!loaded ? (
        <p className={`text-sm ${ownerDashTypography.helper}`}>…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {cells.map((c) => (
            <div
              key={c.id}
              className="rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2"
              data-owner-gift-home-kpi={c.id}
            >
              <p className={ownerDashTypography.cellTitle}>{c.label}</p>
              <p className={`mt-1 tabular-nums ${ownerDashTypography.metric}`}>{formatMoneyPhp(c.value)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={OwnerRoutes.giftCertificatesRedemptions(storeId)}
          prefetch={false}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-surface)] text-[13px] font-semibold text-[var(--biz-fg)]"
          data-owner-gift-home-cta="redemptions"
        >
          {safeT("gift_u5_cta_redemptions", {
            fallbackKo: "사용 내역",
            fallbackEn: "Usage history",
          })}
        </Link>
        <Link
          href={OwnerRoutes.giftCertificatesMoney(storeId)}
          prefetch={false}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[4px] bg-[var(--biz-primary)] text-[13px] font-semibold text-white"
          data-owner-gift-home-cta="money"
        >
          {safeT("gift_owner_cta_money", {
            fallbackKo: "수익 관리",
            fallbackEn: "Revenue management",
          })}
        </Link>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard } from "@/components/currency";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  aggregateOwnerRedemptionKpis,
  ownerRedemptionStatusLabelKey,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import {
  computeOwnerEconomicReportingSum,
  type GiftPromoDisplayFields,
} from "@/lib/gift-certificate/gift-promo-economics";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";

type MoneyView = "money" | "history" | "redemptions";
type RedemptionFilter = "all" | "pending" | "recognized" | "refund";

const EMPTY_PROMO: GiftPromoDisplayFields = {
  contracted: 0,
  recognized: 0,
  unrecognized: 0,
  settled: 0,
  outstanding: 0,
};

export function OwnerGiftMoneyOpsPanel(props: {
  storeId: string;
  view: MoneyView;
  onGo: (view: MoneyView) => void;
  onBackHome: () => void;
}) {
  const { storeId, view, onGo, onBackHome } = props;
  const { safeT } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [redemptions, setRedemptions] = useState<OwnerGiftRedemptionRow[]>([]);
  const [ownerPromo, setOwnerPromo] = useState<GiftPromoDisplayFields>(EMPTY_PROMO);
  const [redemptionFilter, setRedemptionFilter] = useState<RedemptionFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** D-2 option A: gift revenue is paid on the gift rail (admin payout), not Coin. */
  const [giftRail, setGiftRail] = useState<{ availablePhp: number; paidOutPhp: number } | null>(null);

  const financeHref = OwnerRoutes.finance(storeId);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    if (!sid) return;
    setLoaded(false);
    try {
      const [financeRes, redemptionsRes, promoRes] = await Promise.all([
        fetch(`/api/me/stores/${encodeURIComponent(sid)}/finance`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/redemptions`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/promo`, {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);
      const finance = financeRes.ok
        ? ((await financeRes.json()) as { assets?: { storePoints?: { balance?: number } } })
        : null;
      const redemptionJson = redemptionsRes.ok
        ? ((await redemptionsRes.json()) as {
            ok?: boolean;
            redemptions?: OwnerGiftRedemptionRow[];
            giftRail?: { availablePhp?: number; paidOutPhp?: number } | null;
          })
        : null;
      const promoJson =
        promoRes?.ok
          ? ((await promoRes.json()) as { ok?: boolean; ownerPromo?: GiftPromoDisplayFields })
          : null;

      setCoinBalance(Math.trunc(Number(finance?.assets?.storePoints?.balance) || 0));
      setRedemptions(redemptionJson?.ok ? redemptionJson.redemptions ?? [] : []);
      const rail = redemptionJson?.ok ? redemptionJson.giftRail : null;
      setGiftRail(
        rail
          ? {
              availablePhp: Math.max(0, Math.trunc(Number(rail.availablePhp) || 0)),
              paidOutPhp: Math.max(0, Math.trunc(Number(rail.paidOutPhp) || 0)),
            }
          : null
      );
      setOwnerPromo(promoJson?.ok && promoJson.ownerPromo ? promoJson.ownerPromo : EMPTY_PROMO);
    } finally {
      setLoaded(true);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => aggregateOwnerRedemptionKpis(redemptions), [redemptions]);
  const economicReportingNet = useMemo(
    () =>
      computeOwnerEconomicReportingSum({
        recognizedMerchantNet: kpis.recognizedMerchantNet,
        ownerPromoRecognized: ownerPromo.recognized,
      }),
    [kpis.recognizedMerchantNet, ownerPromo.recognized]
  );
  const filteredRedemptions = useMemo(() => {
    if (redemptionFilter === "all") return redemptions;
    return redemptions.filter((row) => {
      if (redemptionFilter === "refund") return row.reversed;
      if (redemptionFilter === "recognized") return !row.reversed && row.recognized;
      return !row.reversed && !row.recognized;
    });
  }, [redemptions, redemptionFilter]);

  const tabs = (
    <div className="mb-3 grid min-w-0 grid-cols-3 gap-2" data-owner-gift-money-tabs="1">
      <button
        type="button"
        className={`min-h-[44px] rounded-ui-rect px-1.5 text-xs font-medium sm:text-sm ${
          view === "money" ? "bg-signature text-sam-on-primary" : "border border-sam-border bg-sam-surface"
        }`}
        onClick={() => onGo("money")}
      >
        {safeT("gift_owner_tab_summary", {
          fallbackKo: "수익 요약",
          fallbackEn: "Revenue summary",
        })}
      </button>
      <Link
        href={`${financeHref}#coin-history`}
        className="flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-1.5 text-center text-xs font-medium sm:text-sm"
      >
        {safeT("gift_owner_tab_history", {
          fallbackKo: "Coin 내역",
          fallbackEn: "Coin history",
        })}
      </Link>
      <button
        type="button"
        className={`min-h-[44px] rounded-ui-rect px-1.5 text-xs font-medium sm:text-sm ${
          view === "redemptions"
            ? "bg-signature text-sam-on-primary"
            : "border border-sam-border bg-sam-surface"
        }`}
        onClick={() => onGo("redemptions")}
      >
        {safeT("gift_owner_tab_redemptions", {
          fallbackKo: "사용 내역",
          fallbackEn: "Usage history",
        })}
      </button>
    </div>
  );

  if (view === "redemptions") {
    const filters: { id: RedemptionFilter; key: MessageKey; ko: string; en: string }[] = [
      { id: "all", key: "gift_owner_redemption_filter_all", ko: "전체", en: "All" },
      { id: "pending", key: "gift_owner_redemption_filter_pending", ko: "확정 대기", en: "Pending" },
      {
        id: "recognized",
        key: "gift_owner_redemption_filter_recognized",
        ko: "확정",
        en: "Recognized",
      },
      { id: "refund", key: "gift_owner_redemption_filter_refund", ko: "환불", en: "Refund" },
    ];
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_redemptions_title", {
          fallbackKo: "상품권 사용 내역",
          fallbackEn: "Gift redemptions",
        })}
      >
        {tabs}
        <div className="mb-3 grid grid-cols-4 gap-1.5" data-owner-gift-redemption-filters="1">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`min-h-[40px] rounded-ui-rect px-1 text-xs font-medium ${
                redemptionFilter === filter.id
                  ? "bg-signature text-sam-on-primary"
                  : "border border-sam-border bg-sam-surface"
              }`}
              onClick={() => setRedemptionFilter(filter.id)}
            >
              {safeT(filter.key, { fallbackKo: filter.ko, fallbackEn: filter.en })}
            </button>
          ))}
        </div>
        {!loaded ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : redemptions.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-sam-muted">
              {safeT("gift_u5_redemptions_empty", {
                fallbackKo: "아직 사용된 상품권이 없습니다.",
                fallbackEn: "No gift redemptions yet.",
              })}
            </p>
            <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={onBackHome}>
              {safeT("gift_owner_cta_apply", {
                fallbackKo: "상품권 판매 신청",
                fallbackEn: "Apply to sell gift certificates",
              })}
            </button>
          </div>
        ) : filteredRedemptions.length === 0 ? (
          <p className="text-sm text-sam-muted">—</p>
        ) : (
          <ul className="space-y-2" data-owner-gift-redemption-list="1">
            {filteredRedemptions.map((row) => {
              const open = expandedId === row.id;
              const pending = !row.reversed && !row.recognized;
              const statusKey = ownerRedemptionStatusLabelKey(row);
              return (
                <li key={row.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-redemption-id={row.id}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedId(open ? null : row.id)}
                  >
                    <p className="truncate text-sm font-semibold">{row.giftTitle || "Gift"}</p>
                    <p className="mt-1 text-xs text-sam-muted">
                      {row.customerLabel || "—"} ·{" "}
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                      <span>
                        {safeT("gift_u5_used", { fallbackKo: "사용 금액", fallbackEn: "Redeemed" })}:{" "}
                        <strong>{formatMoneyPhp(row.redeemedAmount)}</strong>
                      </span>
                      <span>
                        {safeT("gift_u5_fee", { fallbackKo: "DIBAY 수수료", fallbackEn: "DIBAY fee" })}:{" "}
                        <strong>{formatMoneyPhp(row.platformFeeAmount)}</strong>
                      </span>
                      <span>
                        {safeT("gift_u5_net", {
                          fallbackKo: "상품권 정산 수익",
                          fallbackEn: "Gift settlement revenue",
                        })}
                        : <strong>{formatMoneyPhp(row.merchantNetAmount)}</strong>
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium">
                      {safeT(statusKey as MessageKey, {
                        fallbackKo: row.reversed ? "환불 / 역분개" : pending ? "수익 확정 대기" : "수익 확정",
                        fallbackEn: row.reversed ? "Refund / reversed" : pending ? "Revenue pending" : "Revenue recognized",
                      })}
                    </p>
                  </button>
                  {open ? (
                    <div className="mt-3 border-t border-sam-border pt-3 text-xs">
                       <p className="font-mono break-all" data-owner-gift-public-number="1">
                         {row.publicGiftNumber || row.instanceId}
                       </p>
                      <Link
                        href={`${OwnerRoutes.orders(storeId)}${OwnerRoutes.orders(storeId).includes("?") ? "&" : "?"}order_id=${encodeURIComponent(row.orderId)}`}
                        className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2 inline-flex`}
                      >
                        {safeT("gift_u5_cta_order", {
                          fallbackKo: "주문 보기",
                          fallbackEn: "View order",
                        })}
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </OwnerStoreAdminDashSection>
    );
  }

  return (
    <div className="space-y-4" data-owner-gift-money="coin-converged">
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_money_title", {
          fallbackKo: "상품권 수익",
          fallbackEn: "Gift revenue",
        })}
      >
        {tabs}
        {!loaded ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-xs text-sam-muted">
                {safeT("gift_u5_kpi_merchant_net", {
                  fallbackKo: "확정 상품권 수익",
                  fallbackEn: "Recognized gift revenue",
                })}
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatMoneyPhp(kpis.recognizedMerchantNet)}
              </p>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-xs text-sam-muted">
                {safeT("gift_u5_kpi_pending_merchant", {
                  fallbackKo: "정산 대기 (주문 완료 전)",
                  fallbackEn: "Pending (order not completed)",
                })}
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatMoneyPhp(kpis.pendingMerchantNet)}
              </p>
            </div>
            {giftRail ? (
              <>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-rail="available">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_available", {
                      fallbackKo: "상품권 정산 지급 가능",
                      fallbackEn: "Gift payout available",
                    })}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{formatMoneyPhp(giftRail.availablePhp)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-rail="paid-out">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_rail_paid_out", {
                      fallbackKo: "상품권 정산 지급 완료",
                      fallbackEn: "Gift payout paid",
                    })}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{formatMoneyPhp(giftRail.paidOutPhp)}</p>
                </div>
              </>
            ) : null}
          </div>
        )}
        <p className="mt-3 text-xs text-sam-muted" data-owner-gift-rail-notice="1">
          {safeT("gift_u5_rail_notice", {
            fallbackKo:
              "안내: 이제 Coin에는 DIBAY가 부담한 쿠폰 할인 지원금만 적립됩니다. 상품권 사용 매출(DIBAY 수수료 차감 후)은 Coin이 아닌 상품권 정산으로 따로 지급됩니다. 변경 전에 적립된 Coin은 그대로 유지됩니다.",
            fallbackEn:
              "Notice: Coin now accrues only DIBAY-funded coupon support. Gift certificate sales (after the DIBAY fee) are settled separately by gift payout, not Coin. Coin credited before this change stays as is.",
          })}
        </p>
      </OwnerStoreAdminDashSection>

      <CurrencyBalanceCard
        currency="coin"
        amount={coinBalance}
        actions={[
          { id: "withdraw", href: `${financeHref}#coin-withdraw`, primary: true },
          { id: "history", href: `${financeHref}#coin-history` },
        ]}
        footer={
          <p className="text-sm text-sam-muted">
            {safeT("gift_owner_action_cash_out_desc", {
              fallbackKo:
                "Coin에는 DIBAY 부담 쿠폰 지원금만 적립됩니다. 상품권 수익은 상품권 정산으로 별도 지급됩니다. Coin 환전과 내역은 매장 재무에서 관리합니다.",
              fallbackEn:
                "Coin accrues only DIBAY-funded coupon support. Gift revenue is paid separately by gift settlement. Manage Coin withdrawals and history in Store Finance.",
            })}
          </p>
        }
      />

      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_panel_economic_title", {
          fallbackKo: "상품권 경제 손익 (보고용)",
          fallbackEn: "Gift economic P&L (reporting)",
        })}
      >
        <p className="text-sm tabular-nums">
          {safeT("gift_u5_panel_economic_sum", {
            vars: {
              merchant: formatMoneyPhp(kpis.recognizedMerchantNet),
              promo: formatMoneyPhp(ownerPromo.recognized),
              net: formatMoneyPhp(economicReportingNet),
            },
            fallbackKo: `정산 ${formatMoneyPhp(kpis.recognizedMerchantNet)} − 프로모션 ${formatMoneyPhp(ownerPromo.recognized)} = ${formatMoneyPhp(economicReportingNet)}`,
            fallbackEn: `Settlement ${formatMoneyPhp(kpis.recognizedMerchantNet)} − promo ${formatMoneyPhp(ownerPromo.recognized)} = ${formatMoneyPhp(economicReportingNet)}`,
          })}
        </p>
        <p className="mt-1 text-xs text-sam-muted">
          {safeT("gift_u5_panel_economic_note", {
            fallbackKo: "보고용 참고 값이며 Coin 잔액은 매장 재무가 단일 기준입니다.",
            fallbackEn: "Reporting reference only. Store Finance is the single source for Coin balance.",
          })}
        </p>
      </OwnerStoreAdminDashSection>
    </div>
  );
}

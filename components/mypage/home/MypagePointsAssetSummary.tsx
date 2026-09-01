"use client";

import Link from "next/link";
import { ChevronRight, Coins, Megaphone, Ticket, Wallet } from "lucide-react";
import { CurrencyAmount } from "@/components/currency";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_CHEVRON_CLASS,
  MYPAGE_HOME_ICON_WRAP_CLASS,
  MYPAGE_HOME_MENU_TITLE_CLASS,
  MYPAGE_HOME_META_TEXT_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Logged-in /mypage — canonical Member Point SSOT asset strip.
 * Includes Revenue Hub entry: 「내 홍보 / 광고」 (/mypage/ads).
 */
export function MypagePointsAssetSummary() {
  const { safeT } = useI18n();
  const { balance, loading } = useUserPointBalance();

  return (
    <section className={MYPAGE_HOME_CARD_CLASS} data-testid="mypage-points-asset-summary">
      <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
          {safeT("mypage_comp_asset_summary_title", {
            fallbackKo: "내 자산",
            fallbackEn: "My assets",
          })}
        </h2>
      </div>
      <Link href="/mypage/points" className={MYPAGE_HOME_ROW_CLASS}>
        <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>
          <Coins className="currency-amount--point h-5 w-5" aria-hidden />
        </span>
        <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>
          {safeT("mypage_comp_stat_points", {
            fallbackKo: "포인트",
            fallbackEn: "Point",
          })}
        </span>
        {loading ? (
          <span className={`shrink-0 tabular-nums ${MYPAGE_HOME_META_TEXT_CLASS}`}>…</span>
        ) : (
          <CurrencyAmount
            currency="point"
            amount={balance}
            compactPoint
            className={`shrink-0 ${MYPAGE_HOME_META_TEXT_CLASS}`}
          />
        )}
        <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden />
      </Link>
      <Link href="/mypage/coupons" className={`${MYPAGE_HOME_ROW_CLASS} ${MYPAGE_HOME_ROW_DIVIDER_CLASS}`}>
        <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>
          <Ticket className="h-5 w-5" aria-hidden />
        </span>
        <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>
          {safeT("store_coupon_wallet_title", {
            fallbackKo: "쿠폰",
            fallbackEn: "Coupons",
          })}
        </span>
        <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden />
      </Link>
      <Link
        href="/mypage/ads"
        className={`${MYPAGE_HOME_ROW_CLASS} ${MYPAGE_HOME_ROW_DIVIDER_CLASS}`}
        data-testid="mypage-revenue-hub-entry"
      >
        <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>
          <Megaphone className="h-5 w-5" aria-hidden />
        </span>
        <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>
          {safeT("mypage_comp_business_ads", {
            fallbackKo: "내 홍보 / 광고",
            fallbackEn: "Promotions / ads",
          })}
        </span>
        <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden />
      </Link>
      <Link href="/mypage/points/charge" className={`${MYPAGE_HOME_ROW_CLASS} ${MYPAGE_HOME_ROW_DIVIDER_CLASS}`}>
        <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>
          {safeT("points_charge", {
            fallbackKo: "충전 신청",
            fallbackEn: "Top-up request",
          })}
        </span>
        <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden />
      </Link>
    </section>
  );
}

"use client";

import Link from "next/link";
import { ChevronRight, Coins, Wallet } from "lucide-react";
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
 * Logged-in /mypage — Member Point SSOT asset strip (no Store Point, no fake metrics).
 */
export function MypagePointsAssetSummary() {
  const { safeT, language } = useI18n();
  const { balance, loading } = useUserPointBalance();
  const value = loading
    ? "…"
    : balance.toLocaleString(language === "ko" ? "ko-KR" : "en-US");

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
          <Coins className="h-5 w-5" aria-hidden />
        </span>
        <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>
          {safeT("mypage_comp_stat_points", {
            fallbackKo: "포인트",
            fallbackEn: "Points",
          })}
        </span>
        <span className={`shrink-0 tabular-nums ${MYPAGE_HOME_META_TEXT_CLASS}`}>{value}</span>
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

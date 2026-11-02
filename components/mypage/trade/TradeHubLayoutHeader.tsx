"use client";

import { usePathname } from "next/navigation";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveMypageIaTitleKey } from "@/lib/mypage/mypage-ia";

export function TradeHubLayoutHeader() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  /** 내정보 「거래」 분류 화면의 기능 화면(찜 등)은 한 화면 — 판매·찜·채팅 이동 탭을 겹쳐 두지 않는다 (분류 설계 2026-11-02) */
  const iaScreen = resolveMypageIaTitleKey(pathname) != null;
  return (
    <MySubpageHeader
      title={t("tier1_trade_hub_title")}
      hideCtaStrip
      registerMainTier1={false}
      stickyBelow={iaScreen ? undefined : <TradeHubTopTabs />}
    />
  );
}

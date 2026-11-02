"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { resolveMypageIaTitleKey } from "@/lib/mypage/mypage-ia";

/**
 * `/mypage/trade/*` 화면 틀 — 내정보 공통 틀(`MyScreen`). 제목·뒤로는 분류(IA) 규칙(찜 → 「찜」·뒤로 거래).
 * 분류 행 화면(찜)은 한 화면이라 판매·찜·채팅 이동 탭을 두지 않는다. 그 외 거래 허브 하위는 기존 이동 탭 유지.
 */
export function TradeHubScreen({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const iaScreen = resolveMypageIaTitleKey(pathname) != null;
  return (
    <MyScreen
      title={t("tier1_trade_hub_title")}
      template="list"
      headerBelow={iaScreen ? undefined : <TradeHubTopTabs />}
    >
      <div className="flex flex-col gap-1">{children}</div>
    </MyScreen>
  );
}

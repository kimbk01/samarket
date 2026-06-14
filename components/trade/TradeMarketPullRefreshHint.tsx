"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TradeFeedBufferingSpinner } from "@/components/trade/TradeFeedBufferingSpinner";
import {
  getTradeMarketPullRefreshServerSnapshot,
  getTradeMarketPullRefreshSnapshot,
  resolveTradeMarketPullHintHeightPx,
  subscribeTradeMarketPullRefresh,
  TRADE_MARKET_PULL_REFRESH_COLLAPSE_MS,
  TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX,
} from "@/lib/trade/trade-market-pull-refresh-store";

/** `/market` 1단·2단(TradePrimaryTabs) 사이 PTR 슬롯 — 시그니처(스타먹스) 배경 */
export function TradeMarketPullRefreshHint() {
  const { t } = useI18n();
  const pull = useSyncExternalStore(
    subscribeTradeMarketPullRefresh,
    getTradeMarketPullRefreshSnapshot,
    getTradeMarketPullRefreshServerSnapshot
  );
  const showPullHint = pull.pullPx > 2 || pull.refreshing;
  const pullReady = pull.pullPx >= TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX;
  const hintHeightPx = resolveTradeMarketPullHintHeightPx(pull);
  const pullHintHeight = hintHeightPx > 0 ? `${hintHeightPx}px` : "0px";
  const hintTransitionMs =
    pull.refreshing ? 180 : hintHeightPx === 0 ? TRADE_MARKET_PULL_REFRESH_COLLAPSE_MS : 120;

  return (
    <div
      data-trade-market-ptr-hint
      className="w-full overflow-hidden bg-signature text-center ease-[cubic-bezier(0.33,1,0.68,1)]"
      style={{
        height: pullHintHeight,
        opacity: showPullHint ? 1 : 0,
        transitionProperty: "height, opacity",
        transitionDuration: `${hintTransitionMs}ms`,
        transitionTimingFunction: pull.refreshing ? "ease-out" : "cubic-bezier(0.33, 1, 0.68, 1)",
      }}
      aria-live="polite"
    >
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-2 py-1">
        {pull.refreshing ?
          <>
            <TradeFeedBufferingSpinner className="text-white" />
            <p className="text-[13px] font-medium leading-snug text-white/92">
              {t("store_home_pull_refreshing")}
            </p>
          </>
        : <p className="text-[13px] font-medium leading-snug text-white/92">
            {pullReady ? t("store_home_pull_release") : t("store_home_pull_hint")}
          </p>
        }
      </div>
    </div>
  );
}

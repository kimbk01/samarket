"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreDeliveryBufferingSpinner } from "@/components/stores/StoreDeliveryBufferingSpinner";
import {
  getStoresBrowsePullRefreshServerSnapshot,
  getStoresBrowsePullRefreshSnapshot,
  resolveStoresBrowsePullHintHeightPx,
  STORES_BROWSE_PULL_REFRESH_COLLAPSE_MS,
  STORES_BROWSE_PULL_REFRESH_THRESHOLD_PX,
  subscribeStoresBrowsePullRefresh,
} from "@/lib/stores/stores-browse-pull-refresh-store";

/** browse 4·5단 사이 PTR 슬롯 — 배경 `#eac784`, `/stores` 홈과 동일 당김 높이·임계값 */
export function StoresBrowsePullRefreshHint() {
  const { t } = useI18n();
  const pull = useSyncExternalStore(
    subscribeStoresBrowsePullRefresh,
    getStoresBrowsePullRefreshSnapshot,
    getStoresBrowsePullRefreshServerSnapshot
  );
  const showPullHint = pull.pullPx > 2 || pull.refreshing;
  const pullReady = pull.pullPx >= STORES_BROWSE_PULL_REFRESH_THRESHOLD_PX;
  const hintHeightPx = resolveStoresBrowsePullHintHeightPx(pull);
  const pullHintHeight = hintHeightPx > 0 ? `${hintHeightPx}px` : "0px";
  const hintTransitionMs =
    pull.refreshing ? 180 : hintHeightPx === 0 ? STORES_BROWSE_PULL_REFRESH_COLLAPSE_MS : 120;

  return (
    <div
      data-stores-browse-ptr-hint
      className="w-full overflow-hidden bg-[#eac784] text-center ease-[cubic-bezier(0.33,1,0.68,1)]"
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
            <StoreDeliveryBufferingSpinner />
            <p className="text-[13px] font-medium leading-snug text-[#362415]">
              {t("store_home_pull_refreshing")}
            </p>
          </>
        : <p className="text-[13px] font-medium leading-snug text-[#362415]">
            {pullReady ? t("store_home_pull_release") : t("store_home_pull_hint")}
          </p>
        }
      </div>
    </div>
  );
}

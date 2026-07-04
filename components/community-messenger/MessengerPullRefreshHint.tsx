"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getMessengerPullRefreshServerSnapshot,
  getMessengerPullRefreshSnapshot,
  MESSENGER_PULL_REFRESH_COLLAPSE_MS,
  MESSENGER_PULL_REFRESH_THRESHOLD_PX,
  resolveMessengerPullHintHeightPx,
  subscribeMessengerPullRefresh,
} from "@/lib/community-messenger/messenger-pull-refresh-store";

function MessengerPtrSpinner() {
  return (
    <span
      className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white"
      aria-hidden
    />
  );
}

/** `/community-messenger` 1단·2단(섹션 탭) 사이 PTR 슬롯 — 커뮤니티(`/philife`)와 동일 시그니처 배경 */
export function MessengerPullRefreshHint() {
  const { t } = useI18n();
  const pull = useSyncExternalStore(
    subscribeMessengerPullRefresh,
    getMessengerPullRefreshSnapshot,
    getMessengerPullRefreshServerSnapshot
  );
  const showPullHint = pull.pullPx > 2 || pull.refreshing;
  const pullReady = pull.pullPx >= MESSENGER_PULL_REFRESH_THRESHOLD_PX;
  const hintHeightPx = resolveMessengerPullHintHeightPx(pull);
  const pullHintHeight = hintHeightPx > 0 ? `${hintHeightPx}px` : "0px";
  const hintTransitionMs =
    pull.refreshing ? 180 : hintHeightPx === 0 ? MESSENGER_PULL_REFRESH_COLLAPSE_MS : 120;

  return (
    <div
      data-messenger-ptr-hint
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
            <MessengerPtrSpinner />
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

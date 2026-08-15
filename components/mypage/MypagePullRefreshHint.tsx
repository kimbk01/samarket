"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getMypagePullRefreshServerSnapshot,
  getMypagePullRefreshSnapshot,
  MYPAGE_PULL_REFRESH_COLLAPSE_MS,
  MYPAGE_PULL_REFRESH_THRESHOLD_PX,
  resolveMypagePullHintHeightPx,
  subscribeMypagePullRefresh,
} from "@/lib/mypage/mypage-pull-refresh-store";

function MypagePtrSpinner() {
  return (
    <span
      className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white"
      aria-hidden
    />
  );
}

/** `/mypage` hub — Tier-1 아래 PTR 슬롯 (시그니처 배경, 기존 hub PTR hint 계약) */
export function MypagePullRefreshHint() {
  const { t } = useI18n();
  const pull = useSyncExternalStore(
    subscribeMypagePullRefresh,
    getMypagePullRefreshSnapshot,
    getMypagePullRefreshServerSnapshot
  );
  const showPullHint = pull.pullPx > 2 || pull.refreshing;
  const pullReady = pull.pullPx >= MYPAGE_PULL_REFRESH_THRESHOLD_PX;
  const hintHeightPx = resolveMypagePullHintHeightPx(pull);
  const pullHintHeight = hintHeightPx > 0 ? `${hintHeightPx}px` : "0px";
  const hintTransitionMs =
    pull.refreshing ? 180 : hintHeightPx === 0 ? MYPAGE_PULL_REFRESH_COLLAPSE_MS : 120;

  return (
    <div
      data-mypage-ptr-hint
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
            <MypagePtrSpinner />
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

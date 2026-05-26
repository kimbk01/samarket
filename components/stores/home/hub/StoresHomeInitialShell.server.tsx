import type { AppLanguageCode } from "@/lib/i18n/config";
import { STORES_HOME_INITIAL_SHELL_SSR_ID } from "@/lib/stores/stores-home-initial-shell";
import { STORES_HOME_STACK } from "@/lib/stores/stores-home-ui";
import { StoresHomeCategorySeedPanelServer } from "@/components/stores/home/hub/StoresHomeCategorySeedPanel.server";
import { StoresHomeFeedSkeletonView } from "@/components/stores/home/hub/stores-home-feed-skeleton-view";
import { StoresHomeHeroBannerView } from "@/components/stores/home/hub/stores-home-hero-banner-view";

/**
 * CONTRACT — `/stores` 표시 전용 SSR shell.
 * shell·category·hero·피드 스켈레톤을 StoresHomeHub hydration 전 HTML 로 내려준다.
 */
export function StoresHomeInitialShellServer({ language }: { language: AppLanguageCode }) {
  return (
    <div
      id={STORES_HOME_INITIAL_SHELL_SSR_ID}
      className="stores-home-initial-shell delivery-ui flex flex-col pb-4"
      data-stores-perf="shell"
    >
      <StoresHomeCategorySeedPanelServer language={language} />
      <div className={`${STORES_HOME_STACK} px-[var(--delivery-page-x)] pt-1`}>
        <StoresHomeHeroBannerView language={language} />
        <StoresHomeFeedSkeletonView />
      </div>
    </div>
  );
}

"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderComposeButton } from "@/components/philife/PhilifeHeaderComposeButton";
import { PhilifeHeaderMessengerButton } from "@/components/philife/PhilifeHeaderMessengerButton";
import { PhilifeHeaderAddressMenuButton } from "@/components/philife/PhilifeHeaderAddressMenuButton";
import { PhilifeHeaderNotificationInbox } from "@/components/philife/PhilifeHeaderNotificationInbox";
import { TradeHeaderComposeButton } from "@/components/trade/TradeHeaderComposeButton";
import { MyHubHeaderInfoHubTrigger } from "@/components/my/MyHubHeaderActions";
import {
  BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY,
  BOTTOM_NAV_TRADE_TAB_LABEL_KEY,
} from "@/lib/main-menu/bottom-nav-config";
import { SectionHeader } from "@/components/layout/sector-header";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";

function UnifiedTier1Shell({ children }: { children: React.ReactNode }) {
  return (
    <header className="w-full min-w-0 max-w-full shrink-0 overflow-x-hidden sector-header-shell sector-header-shell--embedded">
      {children}
    </header>
  );
}

/** `/philife`·`/market` 탐색 1단 — `RegionBar` 와 분리해 `/stores` 청크에서 제외 */
export function RegionBarExplorationTier1({ pathNoQuery }: { pathNoQuery: string }) {
  const { t } = useI18n();
  const isPhilifeFeed = pathNoQuery === "/philife";
  const segmentTitle = isPhilifeFeed ? t(BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY) : t(BOTTOM_NAV_TRADE_TAB_LABEL_KEY);

  return (
    <UnifiedTier1Shell>
      <SectionHeader
        embedded
        titleAlign="left"
        leftSlot={<MyHubHeaderInfoHubTrigger />}
        title={segmentTitle}
        rightSlot={
          <div className={samTier1HeaderIconCluster}>
            {isPhilifeFeed ?
              <>
                <PhilifeHeaderComposeButton />
                <PhilifeHeaderNotificationInbox />
                <PhilifeHeaderMessengerButton />
                <PhilifeHeaderAddressMenuButton />
              </>
            : <>
                <TradeHeaderComposeButton />
                <PhilifeHeaderNotificationInbox />
                <PhilifeHeaderMessengerButton />
              </>
            }
          </div>
        }
      />
    </UnifiedTier1Shell>
  );
}

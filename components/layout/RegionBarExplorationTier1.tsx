"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderComposeButton } from "@/components/philife/PhilifeHeaderComposeButton";
import { PhilifeHeaderMessengerButton } from "@/components/philife/PhilifeHeaderMessengerButton";
import { PhilifeHeaderAddressMenuButton } from "@/components/philife/PhilifeHeaderAddressMenuButton";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { TradeHeaderComposeButton } from "@/components/trade/TradeHeaderComposeButton";
/** Community tier1: compose + address + bell only (no header messenger). Trade keeps messenger. */
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

/** `/philife`·`/`·`/community`·`/market` 탐색 1단 — `RegionBar` 와 분리해 `/stores` 청크에서 제외 */
export function RegionBarExplorationTier1({ pathNoQuery }: { pathNoQuery: string }) {
  const { t } = useI18n();
  /** SSOT: community home hubs share Community header — never Trade title on `/` */
  const isCommunityHome =
    pathNoQuery === "/" || pathNoQuery === "/philife" || pathNoQuery === "/community";
  const segmentTitle = isCommunityHome
    ? t(BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY)
    : t(BOTTOM_NAV_TRADE_TAB_LABEL_KEY);

  return (
    <UnifiedTier1Shell>
      <SectionHeader
        embedded
        titleAlign="left"
        title={segmentTitle}
        rightSlot={
          <div
            className={`${samTier1HeaderIconCluster} ${
              isCommunityHome ? "community-tier1-header-actions" : ""
            }`}
          >
            {isCommunityHome ?
              <>
                <PhilifeHeaderComposeButton />
                <PhilifeHeaderAddressMenuButton />
                <Tier1NotificationAnchor surface="bottom_nav_community" />
              </>
            : <>
                <TradeHeaderComposeButton />
                <PhilifeHeaderMessengerButton />
                <Tier1NotificationAnchor surface="bottom_nav_my" />
              </>
            }
          </div>
        }
      />
    </UnifiedTier1Shell>
  );
}

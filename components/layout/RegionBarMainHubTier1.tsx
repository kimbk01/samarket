"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderComposeButton } from "@/components/philife/PhilifeHeaderComposeButton";
import { PhilifeHeaderAddressMenuButton } from "@/components/philife/PhilifeHeaderAddressMenuButton";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { MyMypageHeaderActions } from "@/components/my/MyMypageHeaderActions";
import {
  BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY,
  BOTTOM_NAV_TRADE_TAB_LABEL_KEY,
  NAV_DOT_LABEL_KEYS,
} from "@/lib/main-menu/bottom-nav-config";
import { SectionHeader } from "@/components/layout/sector-header";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import {
  resolveMainTabKeepAliveHub,
  type MainTabKeepAliveHubId,
} from "@/lib/layout/resolve-main-surface";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS } from "@/lib/ui/tier1-header-icon";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";

function UnifiedTier1Shell({ children }: { children: React.ReactNode }) {
  return (
    <header className="w-full min-w-0 max-w-full shrink-0 overflow-x-hidden sector-header-shell sector-header-shell--embedded">
      {children}
    </header>
  );
}

function resolveMainHubId(pathNoQuery: string): Exclude<MainTabKeepAliveHubId, "delivery"> | null {
  const hub = resolveMainTabKeepAliveHub(pathNoQuery);
  if (hub === "community" || hub === "trade" || hub === "chat" || hub === "mypage") return hub;
  /** `/market/[slug]` etc. — same MAIN HUB as Trade keep-alive */
  if (isTradeFloatingMenuSurface(pathNoQuery)) {
    if (pathNoQuery.startsWith("/mypage/")) return "mypage";
    return "trade";
  }
  return null;
}

function defaultRightSlot(hub: Exclude<MainTabKeepAliveHubId, "delivery">): ReactNode {
  if (hub === "community") {
    return (
      <div className={`${samTier1HeaderIconCluster} community-tier1-header-actions`}>
        <PhilifeHeaderComposeButton />
        <PhilifeHeaderAddressMenuButton />
        <Tier1NotificationAnchor surface="bottom_nav_community" />
      </div>
    );
  }
  if (hub === "trade") {
    return <TradeHeaderRightActions />;
  }
  if (hub === "mypage") {
    return <MyMypageHeaderActions />;
  }
  /** chat — shell effects supply `rightSlot`; empty until mounted */
  return null;
}

function hubTitleKey(hub: Exclude<MainTabKeepAliveHubId, "delivery">) {
  if (hub === "community") return BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY;
  if (hub === "trade") return BOTTOM_NAV_TRADE_TAB_LABEL_KEY;
  if (hub === "chat") return NAV_DOT_LABEL_KEYS.chat;
  return NAV_DOT_LABEL_KEYS.my;
}

/**
 * MAIN HUB HEADER — Community / Trade / Chat / MyPage.
 * SAME geometry · typography · left title · icon cluster · safe-top (via AppStickyHeader).
 * Domain surface only via `[data-dibay-domain]` / sector tokens.
 * Delivery is NOT this component (SPECIAL HEADER).
 */
export function RegionBarMainHubTier1({ pathNoQuery }: { pathNoQuery: string }) {
  const { t } = useI18n();
  const hub = resolveMainHubId(pathNoQuery);
  const extrasRight = useMainTier1ExtrasOptional()?.extras?.tier1?.rightSlot;

  if (hub == null) {
    return null;
  }

  /** Trade HOME identity is Marketplace. Location lives in the entry chrome under this row. */
  const title: ReactNode =
    hub === "trade"
      ? <span className="sr-only">{t("marketplace_home_title")}</span>
      : t(hubTitleKey(hub));
  const rightSlot = extrasRight ?? defaultRightSlot(hub);

  return (
    <UnifiedTier1Shell>
      <SectionHeader embedded titleAlign="left" title={title} rightSlot={rightSlot} />
    </UnifiedTier1Shell>
  );
}

function TradeHeaderRightActions() {
  const { t, safeT } = useI18n();
  const pathname = usePathname() ?? "/market";
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [draft, setDraft] = useState(() => sanitizeMarketplaceQueryText(searchParams.get("q")) ?? "");

  const applyQuery = () => {
    const next = sanitizeMarketplaceQueryText(draft);
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set("q", next);
    else sp.delete("q");
    const qs = sp.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href, { scroll: false });
    setSearchOpen(false);
  };

  return (
    <>
      <div className={`${samTier1HeaderIconCluster} gap-2`}>
        <span className="hidden whitespace-nowrap text-sm font-semibold text-sam-fg sm:inline">
          {t("marketplace_home_title")}
        </span>
        <button
          type="button"
          className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} rounded-ui-rect bg-sam-surface active:scale-[0.98] active:opacity-90`}
          aria-label={t("marketplace_search_entry_aria")}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4 text-sam-fg" aria-hidden />
        </button>
        <Tier1NotificationAnchor surface="bottom_nav_my" />
      </div>
      <DibayBottomSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title={t("marketplace_search_entry_aria")}
      >
        <div className="px-4 pb-4">
          <label className="flex min-h-11 min-w-0 items-center gap-2 overflow-hidden rounded-ui-rect bg-sam-surface-muted px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={safeT("marketplace_search_placeholder", {
                fallbackKo: "DIBAY MARKET에서 검색",
                fallbackEn: "Search DIBAY MARKET",
              })}
              aria-label={t("marketplace_search_entry_aria")}
              className="min-w-0 flex-1 border-0 bg-transparent sam-text-body text-sam-fg placeholder:text-sam-muted focus:outline-none focus:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyQuery();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="mt-3 flex h-11 w-full items-center justify-center rounded-ui-rect bg-signature px-3.5 sam-text-body font-semibold text-white active:scale-[0.98] active:opacity-90"
            onClick={applyQuery}
          >
            {t("common_confirm")}
          </button>
        </div>
      </DibayBottomSheet>
    </>
  );
}

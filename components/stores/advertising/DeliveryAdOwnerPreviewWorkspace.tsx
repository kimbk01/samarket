"use client";

import { useMemo, useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdPlacementPreview } from "@/components/stores/advertising/DeliveryAdPlacementPreview";
import { DeliveryAdOwnerPhoneFrame } from "@/components/stores/advertising/DeliveryAdOwnerPhoneFrame";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import type { DeliveryAdBannerCreativeView } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { DELIVERY_AD_DESIGN_BOARD } from "@/lib/stores/advertising/delivery-ad-design-board-contract";

type PreviewTab = {
  id: string;
  inventoryKey: string;
  labelKey: string;
};

const STORE_SPONSORED_TABS: PreviewTab[] = [
  { id: "home", inventoryKey: "STORES_HOME_FEED", labelKey: "owner_ads_preview_tab_home" },
  { id: "category", inventoryKey: "STORES_CATEGORY_FEED", labelKey: "owner_ads_preview_tab_category" },
];

const BANNER_TABS: PreviewTab[] = [
  { id: "hero", inventoryKey: "STORES_HOME_HERO", labelKey: "owner_ads_preview_tab_hero" },
  { id: "search", inventoryKey: "STORES_SEARCH_TOP", labelKey: "owner_ads_preview_tab_search" },
];

export function DeliveryAdOwnerPreviewWorkspace({
  productKind,
  selectedInventoryKey,
  surfaceEnabled,
  bannerCreative,
  ctaLabel,
  ctaDestinationLabel,
  store,
  storeLoadError,
  presentationMode = "default",
}: {
  productKind: DeliveryAdProductKey;
  selectedInventoryKey: string;
  surfaceEnabled: boolean;
  bannerCreative?: DeliveryAdBannerCreativeView | null;
  ctaLabel?: string | null;
  ctaDestinationLabel?: string | null;
  store?: StoreHomeFeedItem | null;
  storeLoadError?: boolean;
  presentationMode?: "default" | "owner_product";
}) {
  const { t } = useI18n();
  const ownerProduct = presentationMode === "owner_product";
  const tabs =
    productKind === "banner"
      ? BANNER_TABS
      : STORE_SPONSORED_TABS.filter((tab) => tab.inventoryKey === selectedInventoryKey);
  const defaultTab =
    tabs.find((tab) => tab.inventoryKey === selectedInventoryKey)?.id ?? tabs[0]?.id ?? "home";
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const next =
      tabs.find((tab) => tab.inventoryKey === selectedInventoryKey)?.id ?? tabs[0]?.id ?? "home";
    setActiveTab(next);
  }, [selectedInventoryKey, tabs]);

  const activeInventoryKey = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTab)?.inventoryKey ?? selectedInventoryKey;
  }, [activeTab, selectedInventoryKey, tabs]);

  const previewBody = (
    <DeliveryAdOwnerPhoneFrame>
      <DeliveryAdPlacementPreview
        productKind={productKind}
        inventoryKey={activeInventoryKey}
        renderContext="owner_preview"
        presentationMode={ownerProduct ? "owner_product" : "default"}
        surfaceEnabled={surfaceEnabled}
        store={store ?? null}
        storeLoadError={storeLoadError ?? false}
        bannerCreative={bannerCreative ?? null}
        ctaLabel={ctaLabel ?? null}
        ctaDestinationLabel={ctaDestinationLabel ?? null}
      />
    </DeliveryAdOwnerPhoneFrame>
  );

  if (ownerProduct) {
    return (
      <div data-owner-ads-preview-workspace="owner-product">
        <p className="mb-3 text-[15px] font-bold text-sam-fg">
          {t("owner_ads_preview_customer_headline")}
        </p>
        {productKind === "banner" ? (
          <p className="mb-3 text-[13px] text-sam-muted">{t("owner_ads_banner_admin_creative_notice")}</p>
        ) : null}
        {tabs.length > 1 ? (
          <div
            className="mb-3 flex gap-1 rounded-ui-rect border border-[#BDBDBD] bg-[#F5F5F5] p-1"
            role="tablist"
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`flex-1 rounded-ui-rect px-2 py-2 text-[11px] font-semibold ${
                    active ? "bg-[#0A823E] text-white" : "bg-transparent text-[#757575]"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {t(tab.labelKey as never)}
                </button>
              );
            })}
          </div>
        ) : null}
        {previewBody}
      </div>
    );
  }

  return (
    <div data-owner-ads-preview-workspace="design-board">
      <div
        className="mb-3 flex gap-1 rounded-ui-rect border border-[#BDBDBD] bg-[#F5F5F5] p-1"
        role="tablist"
        aria-label={t("owner_ads_section_preview")}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`flex-1 rounded-ui-rect px-2 py-2 text-[11px] font-semibold ${
                active
                  ? "bg-[#0A823E] text-white"
                  : "bg-transparent text-[#757575]"
              }`}
              onClick={() => setActiveTab(tab.id)}
              data-owner-ads-preview-tab={tab.id}
            >
              {t(tab.labelKey as never)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2" data-owner-ads-preview-compare="design-board">
        <div className="rounded-ui-rect border border-[#BDBDBD] bg-[#F5F5F5] p-2">
          <p className="mb-2 text-center text-[10px] font-semibold text-[#757575]">
            {t("owner_ads_preview_compare_organic")}
          </p>
          <div className="rounded-ui-rect border border-dashed border-[#BDBDBD] bg-white px-2 py-6 text-center text-[11px] text-[#757575]">
            {t("owner_ads_preview_compare_organic_body")}
          </div>
        </div>
        <div className="rounded-ui-rect border border-[#0A823E]/40 bg-[#0A823E]/5 p-2">
          <p className="mb-2 text-center text-[10px] font-semibold text-[#0A823E]">
            {t("owner_ads_preview_compare_ad")}
          </p>
          {previewBody}
        </div>
      </div>
    </div>
  );
}

void DELIVERY_AD_DESIGN_BOARD;

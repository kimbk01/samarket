"use client";

/**
 * PRODUCT CUT 2 — Canonical Placement Preview.
 * Reuses customer visual owners; preview contexts never pass exposure tokens.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { StoresHomeTimesaleRowCard } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import { StoreBrowseCategoryRowCard } from "@/components/stores/browse/StoreBrowseCategoryRowCard";
import { homeFeedToRowCard } from "@/components/stores/home/StoreDeliveryRowCard";
import {
  assertPlacementPreviewNoExposureToken,
  isBlockedDetailInventoryPreview,
  placementPreviewSupportsProduct,
  placementPreviewTitleI18nKey,
  type DeliveryAdPlacementPreviewContext,
} from "@/lib/stores/advertising/delivery-ad-placement-preview";
import {
  inventoryViewFromKey,
  type DeliveryAdBannerCreativeView,
} from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { MessageKey } from "@/lib/i18n/messages";
import Link from "next/link";

export type DeliveryAdPlacementPreviewProps = {
  productKind: DeliveryAdProductKey;
  inventoryKey: string;
  renderContext: DeliveryAdPlacementPreviewContext;
  surfaceEnabled: boolean;
  intervalEveryN?: number | null;
  maxInsertion?: number | null;
  taxonomyPrimaryLabel?: string | null;
  taxonomySubLabel?: string | null;
  store?: StoreHomeFeedItem | null;
  storeLoadError?: boolean;
  eligibilityWarning?: boolean;
  bannerCreative?: DeliveryAdBannerCreativeView | null;
  ctaLabel?: string | null;
  /** Admin/Owner preview destination — customer href; clicks disabled in preview chrome. */
  destinationHref?: string | null;
  ctaDestinationLabel?: string | null;
  policyHref?: string | null;
  className?: string;
  /** UI-1 — Owner application step 3: hide technical preview chrome. */
  presentationMode?: "default" | "owner_product";
};

function OrganicMarker({ label }: { label: string }) {
  return (
    <div
      className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-3 text-[12px] text-sam-muted"
      aria-hidden
    >
      {label}
    </div>
  );
}

export function DeliveryAdPlacementPreview(props: DeliveryAdPlacementPreviewProps) {
  const { t, language } = useI18n();
  const {
    productKind,
    inventoryKey,
    renderContext,
    surfaceEnabled,
    intervalEveryN,
    maxInsertion,
    taxonomyPrimaryLabel,
    taxonomySubLabel,
    store,
    storeLoadError,
    eligibilityWarning,
    bannerCreative,
    ctaLabel,
    destinationHref,
    ctaDestinationLabel,
    policyHref,
    className,
    presentationMode = "default",
  } = props;

  const ownerProduct = presentationMode === "owner_product";

  const tokenGate = assertPlacementPreviewNoExposureToken(renderContext, null);
  if (!tokenGate.ok) {
    return null;
  }

  if (isBlockedDetailInventoryPreview(inventoryKey)) {
    return (
      <div className={`rounded-ui-rect border border-sam-border bg-sam-app p-3 ${className ?? ""}`}>
        <p className="text-[13px] text-sam-muted">{t("delivery_ads_preview_detail_unavailable")}</p>
      </div>
    );
  }

  if (!placementPreviewSupportsProduct(productKind, inventoryKey)) {
    return (
      <div className={`rounded-ui-rect border border-sam-border bg-sam-app p-3 ${className ?? ""}`}>
        <p className="text-[13px] text-sam-muted">{t("delivery_ads_preview_inventory_unsupported")}</p>
      </div>
    );
  }

  const titleKey = placementPreviewTitleI18nKey(inventoryKey) as MessageKey;
  const isAdmin = renderContext === "admin_preview";
  const organicLabel = t("delivery_ads_policy_slot_organic");
  const locale = language === "en" ? "en" : "ko";

  return (
    <section
      className={`rounded-ui-rect border border-sam-border bg-sam-surface p-3 ${className ?? ""}`}
      data-delivery-ad-placement-preview="true"
      data-inventory-key={inventoryKey}
      data-render-context={renderContext}
      data-presentation-mode={presentationMode}
      data-has-exposure-token="0"
      aria-label={ownerProduct ? undefined : t("delivery_ads_preview_aria")}
    >
      {!ownerProduct ? (
        <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sam-muted">
            {isAdmin ? t("delivery_ads_preview_admin_kicker") : t("delivery_ads_preview_owner_kicker")}
          </p>
          <h3 className="mt-0.5 text-[14px] font-bold text-sam-fg">{t(titleKey)}</h3>
        </div>
        <span className="rounded-ui-rect bg-sam-app px-2 py-1 text-[10px] font-medium text-sam-muted">
          {t("delivery_ads_preview_not_live")}
        </span>
      </div>

      <p className="mt-1 text-[12px] text-sam-muted">
        {isAdmin ? t("delivery_ads_preview_admin_note") : t("delivery_ads_preview_owner_note")}
      </p>
        </>
      ) : null}

      {!surfaceEnabled ? (
        <p className="mt-2 rounded-ui-rect border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
          {t("delivery_ads_preview_surface_disabled")}
        </p>
      ) : null}

      {eligibilityWarning ? (
        <p className="mt-2 rounded-ui-rect border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
          {t("delivery_ads_preview_store_ineligible")}
        </p>
      ) : null}

      {taxonomyPrimaryLabel ? (
        <p className="mt-2 text-[12px] text-sam-fg">
          {t("delivery_ads_preview_taxonomy")}: {taxonomyPrimaryLabel}
          {taxonomySubLabel ? ` › ${taxonomySubLabel}` : ""}
        </p>
      ) : null}

      {productKind === "store_sponsored" && !ownerProduct ? (
        <p className="mt-2 text-[12px] text-sam-muted">{t("delivery_ads_preview_store_sponsored_explain")}</p>
      ) : productKind !== "store_sponsored" && !ownerProduct ? (
        <p className="mt-2 text-[12px] text-sam-muted">{t("delivery_ads_preview_banner_explain")}</p>
      ) : null}

      {!ownerProduct && inventoryKey === "STORES_SEARCH_TOP" ? (
        <p className="mt-2 text-[12px] text-sam-muted">{t("delivery_ads_preview_search_position")}</p>
      ) : null}
      {!ownerProduct && inventoryKey === "STORES_SEARCH_TOP" ? (
        <p className="mt-1 text-[12px] text-sam-muted">{t("delivery_ads_preview_search_relevance")}</p>
      ) : null}
      {!ownerProduct && inventoryKey === "STORES_HOME_FEED" ? (
        <p className="mt-2 text-[12px] text-sam-muted">{t("delivery_ads_preview_home_rest_explain")}</p>
      ) : null}

      <div className={`${ownerProduct ? "" : "mt-3"} overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app`}>
        {inventoryKey === "STORES_SEARCH_TOP" ? (
          <div className="border-b border-sam-border px-3 py-2">
            <p className="text-[12px] font-semibold text-sam-fg">{t("delivery_ads_preview_search_shell_title")}</p>
            <div className="mt-2 h-9 rounded-full border border-sam-border bg-sam-surface" aria-hidden />
            <p className="mt-2 text-[11px] text-sam-muted">{t("delivery_ads_preview_search_shell_summary")}</p>
          </div>
        ) : null}

        {inventoryKey === "STORES_HOME_HERO" ? (
          <div className="border-b border-sam-border px-3 py-2 text-[11px] text-sam-muted" aria-hidden>
            {t("delivery_ads_preview_home_hero_shell")}
          </div>
        ) : null}

        {(inventoryKey === "STORES_HOME_FEED" || inventoryKey === "STORES_CATEGORY_FEED") && (
          <div className={ownerProduct ? "p-2" : "space-y-2 p-3"}>
            {!ownerProduct ? (
              <>
                <OrganicMarker label={organicLabel} />
                <OrganicMarker label={organicLabel} />
              </>
            ) : null}
            <div className={ownerProduct ? "" : "border-y border-dashed border-signature/30 py-2"}>
              {!ownerProduct ? (
                <p className="mb-2 text-[11px] font-semibold text-signature">
                  {t("delivery_ads_preview_ad_here")}
                </p>
              ) : null}
              {storeLoadError || !store ? (
                <p className="text-[12px] text-sam-muted">{t("delivery_ads_preview_store_missing")}</p>
              ) : inventoryKey === "STORES_HOME_FEED" ? (
                <div className="pointer-events-none" aria-hidden={false}>
                  <ul className="list-none p-0">
                    <StoresHomeTimesaleRowCard
                      store={store}
                      locale={locale}
                      benefit={{
                        imageBadgeLabel: t("store_insertion_sponsored"),
                        imageBadgeClassName: "bg-[#FF8A00]/90 text-white",
                        benefitLine: null,
                        sponsored: true,
                      }}
                    />
                  </ul>
                </div>
              ) : (
                <div className="pointer-events-none">
                  <ul className="list-none p-0">
                    <StoreBrowseCategoryRowCard
                      data={homeFeedToRowCard(store)}
                      locale={locale}
                      featuredMenuHydration="done"
                      campaignBenefit={{
                        kind: "paid_ad",
                        sponsored: true,
                        promoLine: t("store_insertion_sponsored"),
                      }}
                    />
                  </ul>
                </div>
              )}
            </div>
            {!ownerProduct ? <OrganicMarker label={organicLabel} /> : null}
          </div>
        )}

        {(inventoryKey === "STORES_HOME_HERO" || inventoryKey === "STORES_SEARCH_TOP") && (
          <div className="p-3">
            {!bannerCreative?.assetUrl?.trim() ? (
              <p className="text-[12px] text-sam-muted">
                {ownerProduct
                  ? t("owner_ads_banner_admin_creative_notice")
                  : t("delivery_ads_preview_banner_missing")}
              </p>
            ) : (
              <div className="pointer-events-none max-w-[430px]">
                <DeliveryAdBanner
                  inventory={inventoryViewFromKey(inventoryKey as DeliveryAdInventoryKey)}
                  creative={bannerCreative}
                  destination={{
                    href: String(destinationHref ?? "").trim(),
                    ctaLabel: ctaLabel ?? null,
                  }}
                  adLabel={t("store_insertion_sponsored")}
                  renderContext={renderContext}
                  campaignId={null}
                  exposureToken={null}
                />
              </div>
            )}
            {inventoryKey === "STORES_SEARCH_TOP" ? (
              <div className="mt-3 space-y-1.5" aria-hidden>
                <OrganicMarker label={t("delivery_ads_preview_search_organic_stores")} />
                <OrganicMarker label={t("delivery_ads_preview_search_organic_stores")} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!ownerProduct && (ctaLabel || ctaDestinationLabel) && (
        <p className="mt-2 text-[12px] text-sam-fg">
          {ctaLabel ? `${t("delivery_ads_preview_cta")}: ${ctaLabel}` : null}
          {ctaLabel && ctaDestinationLabel ? " · " : null}
          {ctaDestinationLabel
            ? `${t("delivery_ads_preview_cta_target")}: ${ctaDestinationLabel}`
            : null}
        </p>
      )}

      {!ownerProduct &&
      (inventoryKey === "STORES_HOME_FEED" || inventoryKey === "STORES_CATEGORY_FEED") && (
        <dl className="mt-3 grid gap-1 text-[12px] text-sam-muted sm:grid-cols-3">
          <div>
            <dt>{t("admin_delivery_ads_home_policy_enabled")}</dt>
            <dd className="font-semibold text-sam-fg">
              {surfaceEnabled
                ? t("admin_delivery_ads_home_policy_enabled_on")
                : t("admin_delivery_ads_home_policy_enabled_off")}
            </dd>
          </div>
          <div>
            <dt>{t("admin_delivery_ads_browse_policy_max")}</dt>
            <dd className="font-semibold text-sam-fg">
              {maxInsertion == null ? "—" : String(maxInsertion)}
            </dd>
          </div>
          <div>
            <dt>{t("delivery_ads_preview_interval_label")}</dt>
            <dd className="font-semibold text-sam-fg">
              {intervalEveryN == null
                ? "—"
                : t("admin_delivery_ads_home_policy_interval").replace(
                    "{n}",
                    String(intervalEveryN)
                  )}
            </dd>
          </div>
        </dl>
      )}

      {isAdmin && policyHref ? (
        <Link
          href={policyHref}
          className="mt-3 inline-block text-[13px] font-semibold text-signature underline"
        >
          {inventoryKey === "STORES_CATEGORY_FEED"
            ? t("admin_delivery_ads_policy_view_browse")
            : t("admin_delivery_ads_policy_view_home")}
        </Link>
      ) : null}
    </section>
  );
}

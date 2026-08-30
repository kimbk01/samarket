"use client";

/**
 * PRODUCT CUT 2 — Render one PlacementPreview per campaign inventory (no N+1).
 */

import { DeliveryAdPlacementPreview } from "@/components/stores/advertising/DeliveryAdPlacementPreview";
import {
  surfacePolicyForInventory,
  type DeliveryAdPlacementPreviewPayload,
} from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";
import {
  deliveryAdPolicyScreenHref,
} from "@/lib/stores/advertising/delivery-ad-placement-language";
import type { DeliveryAdPlacementPreviewContext } from "@/lib/stores/advertising/delivery-ad-placement-preview";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import type { DeliveryAdBannerCreativeView } from "@/lib/stores/advertising/delivery-ad-banner-contract";

export function DeliveryAdCampaignPlacementPreviews({
  productKind,
  inventoryKeys,
  renderContext,
  placementPreview,
  bannerCreative,
  ctaLabel,
}: {
  productKind: DeliveryAdProductKey;
  inventoryKeys: string[];
  renderContext: DeliveryAdPlacementPreviewContext;
  placementPreview: DeliveryAdPlacementPreviewPayload | null | undefined;
  bannerCreative?: DeliveryAdBannerCreativeView | null;
  ctaLabel?: string | null;
}) {
  const keys = inventoryKeys.filter(Boolean);
  if (!keys.length) return null;

  const payload = placementPreview ?? null;

  return (
    <div className="space-y-3">
      {keys.map((inventoryKey) => {
        const policy = payload
          ? surfacePolicyForInventory(payload, inventoryKey)
          : { enabled: false, intervalEveryN: null, maxInsertion: null };
        const policyHref =
          renderContext === "admin_preview"
            ? deliveryAdPolicyScreenHref(inventoryKey, {
                primarySlug: payload?.taxonomy.primarySlug ?? undefined,
                subSlug: payload?.taxonomy.subSlug ?? undefined,
              })
            : null;

        return (
          <DeliveryAdPlacementPreview
            key={inventoryKey}
            productKind={productKind}
            inventoryKey={inventoryKey}
            renderContext={renderContext}
            surfaceEnabled={policy.enabled}
            intervalEveryN={policy.intervalEveryN}
            maxInsertion={policy.maxInsertion}
            taxonomyPrimaryLabel={
              inventoryKey === "STORES_CATEGORY_FEED"
                ? payload?.taxonomy.primaryLabel ?? payload?.taxonomy.primarySlug
                : null
            }
            taxonomySubLabel={
              inventoryKey === "STORES_CATEGORY_FEED"
                ? payload?.taxonomy.subLabel ?? payload?.taxonomy.subSlug
                : null
            }
            store={payload?.store ?? null}
            storeLoadError={payload?.storeLoadError === true || !payload}
            eligibilityWarning={payload?.eligibilityWarning === true}
            bannerCreative={bannerCreative ?? null}
            ctaLabel={ctaLabel ?? null}
            ctaDestinationLabel={payload?.storeName ?? null}
            policyHref={policyHref}
          />
        );
      })}
    </div>
  );
}

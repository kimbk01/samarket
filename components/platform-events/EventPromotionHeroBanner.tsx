"use client";

import { useEffect, useMemo, useState } from "react";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { EventHeroBannerRuntimeItem } from "@/lib/platform-promotion-distribution/load-active-event-hero-banners";
import { recordPromotionContentVisitClient } from "@/lib/platform-promotion-lifecycle/client-record-content-visit";

type Props = {
  placement: "TRADE_HOME" | "COMMUNITY_HOME";
};

/**
 * Event-owned HERO banner host.
 * Geometry: DeliveryAdBanner STORES_HOME_HERO (39:16).
 * Data: Distribution SSOT only. No Delivery billing / exposureToken.
 */
export function EventPromotionHeroBanner({ placement }: Props) {
  const [items, setItems] = useState<EventHeroBannerRuntimeItem[]>([]);
  const inventory = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/platform-events/hero-banners?placement=${encodeURIComponent(placement)}`,
          { credentials: "same-origin" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: EventHeroBannerRuntimeItem[];
        };
        if (!cancelled && json.ok) setItems(json.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placement]);

  const item = items[0];
  if (!item?.imageUrl) return null;

  return (
    <div
      className="w-full"
      data-event-promotion-hero-banner="1"
      data-presentation="HERO_BANNER"
      data-placement={placement}
      data-paid-side-effect="0"
    >
      <DeliveryAdBanner
        inventory={inventory}
        creative={{
          assetUrl: item.imageUrl,
          headline: item.headline,
          alt: item.headline,
        }}
        destination={{ href: item.href, ctaLabel: null }}
        adLabel="dibaY"
        renderContext="customer"
        campaignId={item.distributionId}
        exposureToken={null}
        onBeforeNavigate={() => {
          recordPromotionContentVisitClient({
            hrefOrEventId: item.href,
            sourceChannel: "BANNER",
            distributionId: item.distributionId,
          });
        }}
      />
    </div>
  );
}

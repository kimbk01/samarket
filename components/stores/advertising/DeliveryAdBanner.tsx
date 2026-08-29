"use client";

import Link from "next/link";
import { useRef } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  DELIVERY_AD_BANNER_CONTENT_MAX_CLASS,
  deliveryAdBannerAspectStyle,
  deliveryAdBannerObjectFit,
  type DeliveryAdBannerProps,
} from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  reportDeliveryAdClick,
  useDeliveryAdImpressionObserver,
} from "@/components/stores/advertising/useDeliveryAdEvents";

/**
 * CUT E/G — ONE Banner renderer for Owner preview / Admin preview / Customer runtime.
 * Production impression/click only when renderContext=customer + exposureToken.
 */
export function DeliveryAdBanner(props: DeliveryAdBannerProps) {
  const {
    inventory,
    creative,
    destination,
    adLabel,
    renderContext,
    campaignId,
    exposureToken,
    className,
    priority,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const isCustomer = renderContext === "customer";
  const token = String(exposureToken ?? "").trim();
  const sessionSeed = `banner:${campaignId ?? "unknown"}:${token.slice(0, 12)}`;

  useDeliveryAdImpressionObserver(rootRef, {
    enabled: isCustomer && Boolean(token),
    exposureToken: token || null,
    sessionSeed,
  });

  const assetUrl = String(creative.assetUrl ?? "").trim();
  if (!assetUrl) {
    return (
      <div
        className="hidden"
        data-delivery-ad-banner="empty"
        data-render-context={renderContext}
        aria-hidden
      />
    );
  }

  const aspect = deliveryAdBannerAspectStyle(inventory);
  const objectFit = deliveryAdBannerObjectFit(inventory);
  const href = String(destination.href ?? "").trim();
  const showSafeGuide = renderContext === "owner_preview" || renderContext === "admin_preview";
  const safe = inventory.safeArea;
  const ctaLabel = String(destination.ctaLabel ?? "").trim();
  const showTextOverlay =
    inventory.key !== "STORES_HOME_HERO"
      ? Boolean(creative.headline?.trim() || creative.subcopy?.trim())
      : false;

  const onCustomerClick = () => {
    if (!isCustomer || !token) return;
    reportDeliveryAdClick({
      exposureToken: token,
      sessionSeed,
    });
  };

  const media = (
    <>
      <div className="absolute inset-0">
        <SamarketThumbnail
          src={assetUrl}
          alt={creative.alt?.trim() || creative.headline?.trim() || adLabel}
          fill
          fetchDisplayPx={820}
          roundedClassName="rounded-none"
          className={objectFit === "contain" ? "object-contain" : "object-cover"}
          imageClassName={
            inventory.objectPosition === "center" ? "object-center" : "object-center"
          }
          priority={priority === true}
        />
      </div>
      <span
        className="absolute left-2 top-2 z-[2] rounded-sm bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white"
        data-delivery-ad-label="true"
      >
        {adLabel}
      </span>
      {showSafeGuide && safe ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[1] border border-dashed border-white/50"
          style={{
            top: `${safe.topPct ?? 0}%`,
            right: `${safe.rightPct ?? 0}%`,
            bottom: `${safe.bottomPct ?? 0}%`,
            left: `${safe.leftPct ?? 0}%`,
          }}
          data-delivery-ad-safe-area="guide"
        />
      ) : null}
      {showTextOverlay ? (
        <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/55 to-transparent px-4 pb-3 pt-8 text-white">
          {creative.headline?.trim() ? (
            <p className="text-[17px] font-bold leading-snug">{creative.headline.trim()}</p>
          ) : null}
          {creative.subcopy?.trim() ? (
            <p className="mt-0.5 text-[13px] leading-snug opacity-90">{creative.subcopy.trim()}</p>
          ) : null}
        </div>
      ) : null}
      {ctaLabel && renderContext !== "customer" ? (
        <span className="absolute bottom-2 right-2 z-[2] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-sam-fg">
          {ctaLabel}
        </span>
      ) : null}
    </>
  );

  const shellClass = [
    DELIVERY_AD_BANNER_CONTENT_MAX_CLASS,
    "relative w-full overflow-hidden rounded-[var(--delivery-radius)]",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const frame = (
    <div
      ref={rootRef}
      className="relative w-full overflow-hidden"
      style={aspect}
      data-delivery-ad-banner="frame"
      data-inventory-key={inventory.key}
      data-render-context={renderContext}
      data-banner-campaign-id={campaignId ?? undefined}
      data-has-exposure-token={token ? "1" : "0"}
      data-aspect={`${inventory.aspectRatioWidth}/${inventory.aspectRatioHeight}`}
    >
      {media}
    </div>
  );

  if (href) {
    return (
      <div className={shellClass}>
        <Link
          href={href}
          prefetch={false}
          className="relative block w-full overflow-hidden"
          aria-label={ctaLabel || adLabel}
          onClick={onCustomerClick}
        >
          {frame}
        </Link>
      </div>
    );
  }

  return <div className={shellClass}>{frame}</div>;
}

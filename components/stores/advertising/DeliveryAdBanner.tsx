"use client";

import { DestinationLink } from "@/components/destination/DestinationLink";
import { useRef, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  DELIVERY_AD_BANNER_CONTENT_MAX_CLASS,
  deliveryAdBannerAspectStyle,
  deliveryAdBannerObjectFit,
  type DeliveryAdBannerProps,
} from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { DELIVERY_AD_CUSTOMER_AD_TAG_CLASS } from "@/lib/stores/advertising/delivery-ad-design-board-contract";
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
    onBeforeNavigate,
    onAssetError,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const isCustomer = renderContext === "customer";
  const token = String(exposureToken ?? "").trim();
  const sessionSeed = `banner:${campaignId ?? "unknown"}:${token.slice(0, 12)}`;
  const assetUrl = String(creative.assetUrl ?? "").trim();
  /** ADC-09 — 로드 실패한 소재 URL (소재가 바뀌면 자동 해제). customer 만 슬롯 숨김. */
  const [failedAssetUrl, setFailedAssetUrl] = useState<string | null>(null);
  const assetFailed = isCustomer && failedAssetUrl !== null && failedAssetUrl === assetUrl;

  useDeliveryAdImpressionObserver(rootRef, {
    enabled: isCustomer && Boolean(token) && !assetFailed,
    exposureToken: token || null,
    sessionSeed,
  });

  if (!assetUrl || assetFailed) {
    return (
      <div
        className="hidden"
        data-delivery-ad-banner="empty"
        data-delivery-ad-asset-error={assetFailed ? "1" : undefined}
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
    onBeforeNavigate?.();
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
          onImageError={
            isCustomer
              ? () => {
                  setFailedAssetUrl(assetUrl);
                  onAssetError?.();
                }
              : undefined
          }
        />
      </div>
      {/* CX-12: 미리보기 = 고객 화면 — 표기 색·반경을 고객 화면과 같은 클래스 하나로 */}
      <span
        className={`absolute left-2 top-2 z-[2] ${DELIVERY_AD_CUSTOMER_AD_TAG_CLASS}`}
        data-delivery-ad-label="true"
        data-delivery-ad-label-context={isCustomer ? "customer" : renderContext}
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
      {/* CX-12: 고객 화면에 없는 CTA 칩은 미리보기에도 그리지 않는다 */}
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
    // EVT-07: banner taps open via openDestination (external → in-app browser, never the WebView).
    return (
      <div className={shellClass}>
        <DestinationLink
          destination={href}
          className="relative block w-full overflow-hidden"
          aria-label={ctaLabel || adLabel}
          onNavigate={onCustomerClick}
          fallback={frame}
        >
          {frame}
        </DestinationLink>
      </div>
    );
  }

  return <div className={shellClass}>{frame}</div>;
}

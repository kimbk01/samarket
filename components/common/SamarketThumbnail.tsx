"use client";

import type { ReactNode, Ref } from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  markBootMetricsThumbnailDecoded,
  markBootMetricsThumbnailLoaded,
  markBootMetricsThumbnailRequested,
} from "@/lib/app-boot/dibay-boot-metrics";
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import { buildStoreProductThumbnailFetchUrl } from "@/lib/media/store-product-image-transform";
import {
  isThumbnailUrlLoaded,
  markThumbnailUrlLoaded,
  probeBrowserCachedImageComplete,
} from "@/lib/media/thumbnail-loaded-url-memory";

export const SAMARKET_THUMBNAIL_FALLBACK_SRC =
  "/images/common/store-product-fallback.svg";

export type SamarketThumbnailProps = {
  src?: string | null;
  alt?: string;
  size?: number;
  fill?: boolean;
  className?: string;
  imageClassName?: string;
  roundedClassName?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
  /** Supabase transform (display px) — post-images · store-product-images. */
  fetchDisplayPx?: number;
  fallbackSrc?: string;
  fallbackNode?: ReactNode;
  imageRef?: Ref<HTMLImageElement>;
  onImageLoad?: () => void;
  onImageError?: () => void;
  /** First feed LCP thumb boot metrics only — not a render gate. */
  bootMetricTrack?: boolean;
};

/**
 * dibaY thumbnail contract:
 * fixed frame + no distortion + center crop + cover + skeleton + fallback.
 */
export function SamarketThumbnail({
  src,
  alt = "",
  size = 96,
  fill = false,
  className = "",
  imageClassName = "",
  roundedClassName = "rounded-[12px]",
  loading = "lazy",
  priority = false,
  fetchDisplayPx,
  fallbackSrc = SAMARKET_THUMBNAIL_FALLBACK_SRC,
  fallbackNode,
  imageRef,
  onImageLoad,
  onImageError,
  bootMetricTrack = false,
}: SamarketThumbnailProps) {
  const resolvedSrc = useMemo(() => {
    const raw = src?.trim() || "";
    if (!raw || !fetchDisplayPx) return raw || fallbackSrc;
    return (
      buildFeedThumbnailFetchUrl(raw, fetchDisplayPx) ??
      buildStoreProductThumbnailFetchUrl(raw, fetchDisplayPx) ??
      raw
    );
  }, [fetchDisplayPx, fallbackSrc, src]);
  const normalizedSrc = resolvedSrc || fallbackSrc;
  const [currentSrc, setCurrentSrc] = useState(normalizedSrc);
  const [loaded, setLoaded] = useState(
    () => priority || isThumbnailUrlLoaded(normalizedSrc) || probeBrowserCachedImageComplete(normalizedSrc)
  );
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(normalizedSrc);
    setLoaded(
      priority || isThumbnailUrlLoaded(normalizedSrc) || probeBrowserCachedImageComplete(normalizedSrc)
    );
    setFallbackFailed(false);
  }, [normalizedSrc, priority]);

  useLayoutEffect(() => {
    if (loaded) return;
    if (probeBrowserCachedImageComplete(currentSrc)) {
      setLoaded(true);
    }
  }, [currentSrc, loaded]);

  useLayoutEffect(() => {
    if (!bootMetricTrack) return;
    const u = normalizedSrc?.trim();
    if (!u || u === fallbackSrc) return;
    markBootMetricsThumbnailRequested();
  }, [bootMetricTrack, fallbackSrc, normalizedSrc]);

  const handleImageLoad = (el: HTMLImageElement) => {
    markThumbnailUrlLoaded(currentSrc);
    setLoaded(true);
    if (bootMetricTrack) {
      markBootMetricsThumbnailLoaded();
      if (typeof el.decode === "function") {
        void el.decode().then(
          () => markBootMetricsThumbnailDecoded(),
          () => markBootMetricsThumbnailDecoded()
        );
      } else {
        markBootMetricsThumbnailDecoded();
      }
    }
    onImageLoad?.();
  };

  const showFallbackNode = fallbackFailed || (!currentSrc && fallbackNode);

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-sam-surface-muted ${roundedClassName} ${className}`}
      style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
    >
      {!loaded && !showFallbackNode ? (
        <div className="absolute inset-0 animate-pulse bg-sam-surface-muted" aria-hidden />
      ) : null}
      {showFallbackNode ? (
        <div className="absolute inset-0 flex items-center justify-center">{fallbackNode}</div>
      ) : (
        <img
          ref={imageRef}
          src={currentSrc}
          alt={alt}
          loading={priority ? "eager" : loading}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className={`pointer-events-none absolute inset-0 block !h-full !w-full max-w-none select-none object-cover object-center ${imageClassName}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center center",
          }}
          onLoad={(ev) => handleImageLoad(ev.currentTarget)}
          onError={() => {
            onImageError?.();
            if (currentSrc !== fallbackSrc) {
              setLoaded(false);
              setCurrentSrc(fallbackSrc);
            } else if (fallbackNode) {
              setFallbackFailed(true);
              setLoaded(true);
            } else {
              setLoaded(true);
            }
          }}
        />
      )}
    </div>
  );
}

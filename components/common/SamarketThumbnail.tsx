"use client";

import type { ReactNode, Ref } from "react";
import { useEffect, useMemo, useState } from "react";
import { buildStoreProductThumbnailFetchUrl } from "@/lib/media/store-product-image-transform";

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
  /** store-product-images Supabase transform (display px). */
  fetchDisplayPx?: number;
  fallbackSrc?: string;
  fallbackNode?: ReactNode;
  imageRef?: Ref<HTMLImageElement>;
  onImageLoad?: () => void;
  onImageError?: () => void;
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
}: SamarketThumbnailProps) {
  const resolvedSrc = useMemo(() => {
    const raw = src?.trim() || "";
    if (!raw || !fetchDisplayPx) return raw || fallbackSrc;
    return buildStoreProductThumbnailFetchUrl(raw, fetchDisplayPx) ?? raw;
  }, [fetchDisplayPx, fallbackSrc, src]);
  const normalizedSrc = resolvedSrc || fallbackSrc;
  const [currentSrc, setCurrentSrc] = useState(normalizedSrc);
  const [loaded, setLoaded] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(normalizedSrc);
    setLoaded(false);
    setFallbackFailed(false);
  }, [normalizedSrc]);

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
          onLoad={() => {
            setLoaded(true);
            onImageLoad?.();
          }}
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

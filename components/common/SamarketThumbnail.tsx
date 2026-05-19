"use client";

import type { ReactNode, Ref } from "react";
import { useEffect, useState } from "react";

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
  fallbackSrc = SAMARKET_THUMBNAIL_FALLBACK_SRC,
  fallbackNode,
  imageRef,
  onImageLoad,
  onImageError,
}: SamarketThumbnailProps) {
  const normalizedSrc = src?.trim() || fallbackSrc;
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
      className={`relative shrink-0 overflow-hidden bg-[#F3F4F6] ${roundedClassName} ${className}`}
      style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
    >
      {!loaded && !showFallbackNode ? (
        <div className="absolute inset-0 animate-pulse bg-[#F3F4F6]" aria-hidden />
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

"use client";

import { useMemo } from "react";
import { SamarketThumbnail, SAMARKET_THUMBNAIL_FALLBACK_SRC } from "@/components/common/SamarketThumbnail";
import {
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
  type DeliveryImageFetchPreset,
} from "@/lib/media/store-product-image-transform";

export const STORE_PRODUCT_THUMBNAIL_FALLBACK_SRC =
  SAMARKET_THUMBNAIL_FALLBACK_SRC;

type StoreProductThumbnailProps = {
  src?: string | null;
  alt?: string;
  size?: number;
  fill?: boolean;
  /** Supabase transform preset — list/thumb bandwidth (UI unchanged). */
  fetchPreset?: DeliveryImageFetchPreset;
  className?: string;
  imageClassName?: string;
  roundedClassName?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
};

/**
 * 배민식 상품 썸네일 기준:
 * 정사각 프레임 고정 + 비율 유지 + center crop + skeleton + fallback.
 */
export function StoreProductThumbnail({
  src,
  alt = "",
  size = 96,
  fill = false,
  fetchPreset,
  className = "",
  imageClassName = "",
  roundedClassName = "rounded-[12px]",
  loading = "lazy",
  priority = false,
}: StoreProductThumbnailProps) {
  const fetchSrc = useMemo(() => {
    if (!src?.trim()) return src;
    if (fetchPreset) {
      return buildStoreProductThumbnailFetchUrlFromPreset(src, fetchPreset) ?? src;
    }
    const displayPx = fill ? 116 : size;
    return buildStoreProductThumbnailFetchUrl(src, displayPx) ?? src;
  }, [fetchPreset, fill, size, src]);

  return (
    <SamarketThumbnail
      src={fetchSrc}
      alt={alt}
      size={size}
      fill={fill}
      className={className}
      imageClassName={imageClassName}
      roundedClassName={roundedClassName}
      loading={loading}
      priority={priority}
      fallbackSrc={STORE_PRODUCT_THUMBNAIL_FALLBACK_SRC}
    />
  );
}

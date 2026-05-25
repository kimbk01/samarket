"use client";

import Image from "next/image";
import { useCallback, useLayoutEffect, useRef } from "react";
import {
  canUseNextImageOptimizer,
  isPreOptimizedDeliveryImageSrc,
  markDeliveryImageLcpCandidate,
  normalizeDeliveryImageSrc,
  traceDeliveryImagePipelineLoad,
  type DeliveryImageRenderer,
} from "@/lib/dibay/delivery-image-pipeline";
import {
  resolveDeliveryMediaFetchSrc,
  resolveDeliveryMediaSurfacePreset,
} from "@/lib/dibay/delivery-image-surface-presets";
import { logDeliveryImageTrace } from "@/lib/dibay/delivery-waterfall-trace";

type DeliveryMediaImageProps = {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** `fill` 부모는 `relative` + 명시 높이 필요 */
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  /** trace·LCP 표면 키 (예: detail-hero, list-row-featured, menu-thumb) */
  surface?: string;
  placeholderClassName?: string;
};

/**
 * 배달 list/detail 공통 이미지 — next/image 우선, 비최적화 URL 은 native img.
 */
export function DeliveryMediaImage({
  src,
  alt = "",
  className = "object-cover",
  fill = false,
  width,
  height,
  sizes,
  priority = false,
  surface = "delivery-media",
  placeholderClassName = "bg-neutral-100",
}: DeliveryMediaImageProps) {
  const surfacePreset = resolveDeliveryMediaSurfacePreset(surface);
  const resolvedSizes = sizes ?? surfacePreset.sizes;
  const baseSrc = normalizeDeliveryImageSrc(src);
  const normalized = baseSrc ? resolveDeliveryMediaFetchSrc(baseSrc, surface) ?? baseSrc : null;
  const effectivePriority = priority && surface === "detail-hero";
  const preOptimized = isPreOptimizedDeliveryImageSrc(normalized);
  const loggedRef = useRef(false);

  useLayoutEffect(() => {
    if (!effectivePriority) return;
    markDeliveryImageLcpCandidate(surface);
  }, [effectivePriority, surface]);

  const onLoad = useCallback(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const renderer: DeliveryImageRenderer =
      effectivePriority && preOptimized
        ? "img"
        : canUseNextImageOptimizer(normalized ?? "")
          ? "next-image"
          : "img";
    traceDeliveryImagePipelineLoad({
      surface,
      src: normalized,
      priority: effectivePriority,
      renderer,
    });
    logDeliveryImageTrace({
      src: normalized,
      priority: effectivePriority,
      loading: effectivePriority ? "eager" : "lazy",
      sizes: resolvedSizes ?? null,
      renderedWidth: width ?? null,
      renderedHeight: height ?? null,
      surface,
    });
  }, [normalized, effectivePriority, surface, resolvedSizes, width, height]);

  if (!normalized) {
    if (fill) {
      return <div className={`absolute inset-0 ${placeholderClassName}`} aria-hidden />;
    }
    return (
      <div
        className={placeholderClassName}
        style={width && height ? { width, height } : undefined}
        aria-hidden
      />
    );
  }

  /** LCP hero — CDN transform URL 직접 fetch (`_next/image` 이중 hop 제거). */
  if (effectivePriority && preOptimized && fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={normalized}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${className}`}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        onLoad={onLoad}
      />
    );
  }

  if (canUseNextImageOptimizer(normalized)) {
    return (
      <Image
        src={normalized}
        alt={alt}
        fill={fill}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        sizes={resolvedSizes}
        className={className}
        priority={effectivePriority}
        loading={effectivePriority ? undefined : "lazy"}
        unoptimized={preOptimized}
        onLoad={onLoad}
      />
    );
  }

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={normalized}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${className}`}
        loading={effectivePriority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={effectivePriority ? "high" : "auto"}
        onLoad={onLoad}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalized}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={effectivePriority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={effectivePriority ? "high" : "auto"}
      onLoad={onLoad}
    />
  );
}

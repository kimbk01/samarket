"use client";

import Image from "next/image";
import { useCallback, useLayoutEffect, useRef } from "react";
import {
  canUseNextImageOptimizer,
  markDeliveryImageLcpCandidate,
  normalizeDeliveryImageSrc,
  traceDeliveryImagePipelineLoad,
  type DeliveryImageRenderer,
} from "@/lib/dibay/delivery-image-pipeline";
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
  const normalized = normalizeDeliveryImageSrc(src);
  const loggedRef = useRef(false);

  useLayoutEffect(() => {
    if (!priority) return;
    markDeliveryImageLcpCandidate(surface);
  }, [priority, surface]);

  const onLoad = useCallback(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const renderer: DeliveryImageRenderer = canUseNextImageOptimizer(normalized ?? "")
      ? "next-image"
      : "img";
    traceDeliveryImagePipelineLoad({
      surface,
      src: normalized,
      priority,
      renderer,
    });
    logDeliveryImageTrace({
      src: normalized,
      priority,
      loading: priority ? "eager" : "lazy",
      sizes: sizes ?? null,
      renderedWidth: width ?? null,
      renderedHeight: height ?? null,
      surface,
    });
  }, [normalized, priority, surface, sizes, width, height]);

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

  if (canUseNextImageOptimizer(normalized)) {
    return (
      <Image
        src={normalized}
        alt={alt}
        fill={fill}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        sizes={sizes}
        className={className}
        priority={priority}
        loading={priority ? undefined : "lazy"}
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
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
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
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onLoad={onLoad}
    />
  );
}

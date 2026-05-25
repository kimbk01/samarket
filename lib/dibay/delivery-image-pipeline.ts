"use client";

import {
  DELIVERY_PERF_TAG_IMAGE_PIPELINE,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

export type DeliveryImageRenderer = "next-image" | "img";

const lcpMarkBySurface = new Map<string, number>();

export function normalizeDeliveryImageSrc(src: string | null | undefined): string | null {
  const s = String(src ?? "").trim();
  if (!s) return null;
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}

export function canUseNextImageOptimizer(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/** Supabase render URL — already resized; skip `_next/image` hop for LCP. */
export function isPreOptimizedDeliveryImageSrc(src: string | null | undefined): boolean {
  const u = typeof src === "string" ? src.trim() : "";
  return u.includes("/storage/v1/render/image/");
}

export function deliveryImageSrcHost(src: string | null): string {
  if (!src) return "";
  try {
    return new URL(src).hostname;
  } catch {
    return "";
  }
}

export function markDeliveryImageLcpCandidate(surface: string): void {
  if (typeof performance === "undefined") return;
  const key = surface.trim();
  if (!key) return;
  lcpMarkBySurface.set(key, performance.now());
}

export function traceDeliveryImagePipelineLoad(opts: {
  surface: string;
  src: string | null;
  priority: boolean;
  renderer: DeliveryImageRenderer;
}): void {
  const surface = opts.surface.trim() || "unknown";
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const marked = lcpMarkBySurface.get(surface);
  const loadMs =
    opts.priority && marked != null ? Math.max(0, Math.round(now - marked)) : null;

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_IMAGE_PIPELINE, {
    event: opts.priority ? "lcp_image_load" : "image_load",
    surface,
    renderer: opts.renderer,
    src_host: deliveryImageSrcHost(opts.src),
    priority: opts.priority,
    load_ms: loadMs,
  });

  if (opts.priority) lcpMarkBySurface.delete(surface);
}

export function resetDeliveryImagePipelineForTests(): void {
  lcpMarkBySurface.clear();
}

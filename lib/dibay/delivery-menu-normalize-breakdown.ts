"use client";

import {
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_MENU_NORMALIZE_BREAKDOWN,
  DELIVERY_PERF_TAG_MENU_NORMALIZE_CHUNK,
  DELIVERY_PERF_TAG_MENU_DEFERRED_NORMALIZE_COMPLETE,
} from "@/lib/dibay/delivery-perf-trace";

export type DeliveryMenuNormalizeBreakdown = {
  event: "menu_normalize_breakdown";
  slug: string;
  total_ms: number;
  parse_products_ms: number;
  sort_products_ms: number;
  group_sections_ms: number;
  recommended_build_ms: number;
  popular_build_ms: number;
  option_summary_parse_ms: number;
  image_model_build_ms: number;
  section_model_build_ms: number;
  product_count: number;
  category_count: number;
  viewport_only: boolean;
};

export function createMenuNormalizeBreakdown(slug: string): DeliveryMenuNormalizeBreakdown {
  return {
    event: "menu_normalize_breakdown",
    slug: slug.trim().toLowerCase(),
    total_ms: 0,
    parse_products_ms: 0,
    sort_products_ms: 0,
    group_sections_ms: 0,
    recommended_build_ms: 0,
    popular_build_ms: 0,
    option_summary_parse_ms: 0,
    image_model_build_ms: 0,
    section_model_build_ms: 0,
    product_count: 0,
    category_count: 0,
    viewport_only: true,
  };
}

export function logDeliveryMenuNormalizeBreakdown(breakdown: DeliveryMenuNormalizeBreakdown): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_NORMALIZE_BREAKDOWN, {
    ...breakdown,
  });
}

export function logDeliveryMenuNormalizeChunk(payload: Record<string, unknown>): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_NORMALIZE_CHUNK, {
    event: "normalize_chunk",
    ...payload,
  });
}

export function logDeliveryMenuDeferredNormalizeComplete(payload: Record<string, unknown>): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_DEFERRED_NORMALIZE_COMPLETE, {
    event: "deferred_normalize_complete",
    ...payload,
  });
}

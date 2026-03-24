"use client";

import type { CategoryWithSettings } from "./types";
import { encodedTradeMarketSegment } from "./tradeMarketPath";

/**
 * URL 세그먼트 (slug 우선, 없으면 id) — trade는 tradeMarketPath와 동일 규칙
 */
function segment(category: CategoryWithSettings): string {
  return encodedTradeMarketSegment(category);
}

/** 글쓰기 단일 진입점: /write/[slug 또는 id] (slug 우선) */
export function getWriteHref(category: CategoryWithSettings): string {
  return `/write/${segment(category)}`;
}

/** 글쓰기 런처 등에서 사용 (getWriteHref와 동일) */
export function getCategoryWriteHref(category: CategoryWithSettings): string {
  return getWriteHref(category);
}

export function getCategoryHref(category: CategoryWithSettings): string {
  const seg = segment(category);
  switch (category.type) {
    case "trade":
      return `/market/${seg}`;
    case "community":
      return `/community`;
    case "service":
      return `/services/${seg}`;
    case "feature":
      return `/features/${seg}`;
    default:
      return `/market/${seg}`;
  }
}

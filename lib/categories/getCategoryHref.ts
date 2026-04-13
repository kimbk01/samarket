"use client";

import type { CategoryWithSettings } from "./types";
import { encodedTradeMarketSegment } from "./tradeMarketPath";

/**
 * URL 세그먼트 — trade 는 `encodedTradeMarketSegment` 에서 id (slug 중복 시 탭 합침 방지)
 */
function segment(category: CategoryWithSettings): string {
  return encodedTradeMarketSegment(category);
}

/**
 * 글쓰기 단일 진입점: /write/[slug 또는 id]
 * **거래(trade)** 는 항상 **UUID** 로 연결해, 슬러그 중복·유사 문자로 `getCategoryBySlugOrId` 가
 * 다른 행을 집는 경우를 막는다. 마켓 목록도 동일하게 `getCategoryHref` → `/market/{uuid}`.
 */
export function getWriteHref(category: CategoryWithSettings): string {
  if (category.type === "trade") {
    return `/write/${encodeURIComponent(category.id)}`;
  }
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

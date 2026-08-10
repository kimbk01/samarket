"use client";

import type { CategoryWithSettings } from "./types";
import { encodedTradeMarketSegment } from "./tradeMarketPath";
import { philifeAppPaths } from "@/lib/philife/paths";

/**
 * URL 세그먼트 — trade 는 `encodedTradeMarketSegment` 에서 id (slug 중복 시 탭 합침 방지)
 */
function segment(category: CategoryWithSettings): string {
  return encodedTradeMarketSegment(category);
}

/**
 * Community 제품 작성 SSOT — legacy `/write` + CommunityWriteForm + `/api/posts/create`
 * 로 보내지 않고 canonical Philife neighborhood writer 만 사용.
 */
export function getCanonicalCommunityWriteHref(): string {
  return philifeAppPaths.write;
}

/**
 * 글쓰기 단일 진입점: /write/[slug 또는 id]
 * **거래(trade)** 는 항상 **UUID** 로 연결해, 슬러그 중복·유사 문자로 `getCategoryBySlugOrId` 가
 * 다른 행을 집는 경우를 막는다. 마켓 목록도 동일하게 `getCategoryHref` → `/market/{uuid}`.
 * **community** 는 canonical `/philife/write` (legacy posts create 격리).
 */
export function getWriteHref(category: CategoryWithSettings): string {
  if (category.type === "community") {
    return getCanonicalCommunityWriteHref();
  }
  if (category.type === "trade") {
    return `/write/${encodeURIComponent(category.id)}`;
  }
  return `/write/${segment(category)}`;
}

/** 단일 글쓰기 페이지(/write) 내부 전환용 링크 */
export function getUnifiedWriteHref(category: CategoryWithSettings): string {
  if (category.type === "community") {
    return getCanonicalCommunityWriteHref();
  }
  const value = category.type === "trade" ? category.id : segment(category);
  return `/write?category=${encodeURIComponent(value)}`;
}

/** 글쓰기 런처 — community 는 canonical writer, 그 외는 /write 단일 화면 */
export function getCategoryWriteHref(category: CategoryWithSettings): string {
  return getUnifiedWriteHref(category);
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

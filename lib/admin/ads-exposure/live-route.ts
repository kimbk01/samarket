/**
 * 「실제 노출 보기」 — normal consumer routes only (no prod debug UI).
 */

export function adsLiveRouteHref(input: {
  productKind: string;
  placementKey?: string | null;
  domain?: string | null;
  targetHref?: string | null;
  categoryId?: string | null;
  topicSlug?: string | null;
}): string | null {
  if (input.targetHref && input.targetHref.startsWith("/")) {
    return input.targetHref;
  }
  const kind = String(input.productKind ?? "").toLowerCase();
  const place = String(input.placementKey ?? "").toUpperCase();

  if (kind.includes("popup")) {
    if (place.includes("DELIVERY") || place === "DELIVERY") return "/stores";
    if (place.includes("TRADE") || place === "TRADE") return "/market";
    if (place.includes("COMMUNITY") || place === "COMMUNITY") return "/philife";
    if (place.includes("MYPAGE")) return "/mypage";
    return "/";
  }

  if (kind.includes("sponsored") || place === "STORES_HOME_FEED" || place === "STORES_CATEGORY_FEED") {
    if (place === "STORES_CATEGORY_FEED" && input.categoryId) {
      return `/stores?category=${encodeURIComponent(input.categoryId)}`;
    }
    return "/stores";
  }

  if (kind.includes("banner") && !kind.includes("feed")) {
    return "/stores";
  }

  if (kind.includes("feed") || place.startsWith("TRADE_") || place.startsWith("COMMUNITY_")) {
    if (place.startsWith("COMMUNITY")) {
      if (place === "COMMUNITY_TOPIC" && input.topicSlug) {
        return `/philife?topic=${encodeURIComponent(input.topicSlug)}`;
      }
      return "/philife";
    }
    if (place === "TRADE_CATEGORY" && input.categoryId) {
      return `/market?category=${encodeURIComponent(input.categoryId)}`;
    }
    return "/market";
  }

  if (kind.includes("community") || input.domain === "community") {
    return "/philife";
  }
  if (kind.includes("trade") || kind.includes("boost") || input.domain === "trade") {
    return "/market";
  }

  return null;
}

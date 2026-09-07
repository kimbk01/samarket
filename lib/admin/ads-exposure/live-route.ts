/**
 * 「실제 노출 보기」 — normal consumer routes only (no prod debug UI).
 *
 * Exact target (post / category / surface with query) may be labeled live.
 * Bare domain roots (/philife, /market) are NOT exact exposure targets for Boost.
 */

export function isAdsDomainRootLiveHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const path = href.split("?")[0]?.replace(/\/$/, "") || "";
  return path === "/philife" || path === "/market" || path === "/" || path === "";
}

/** Boost post target when target_id is known — never invent IDs. */
export function adsBoostExactTargetHref(input: {
  domain?: string | null;
  targetId?: string | null;
}): string | null {
  const id = String(input.targetId ?? "").trim();
  if (!id || /^https?:\/\//i.test(id)) return null;
  const d = String(input.domain ?? "").toLowerCase();
  if (d === "community_promote" || d === "community") {
    return `/philife/post/${encodeURIComponent(id)}`;
  }
  if (d === "trade_promote" || d === "trade") {
    return `/post/${encodeURIComponent(id)}`;
  }
  return null;
}

export function adsLiveLinkLabel(input: {
  href: string | null | undefined;
  domain?: string | null;
  ko: boolean;
}): { href: string; labelKo: string; labelEn: string; exact: boolean } | null {
  const href = String(input.href ?? "").trim();
  if (!href) return null;
  const d = String(input.domain ?? "").toLowerCase();
  const boost = d === "community_promote" || d === "trade_promote";
  if (boost && isAdsDomainRootLiveHref(href)) {
    // Domain root is not exact Boost exposure — honest secondary label only.
    if (d === "community_promote") {
      return {
        href,
        labelKo: "Community에서 보기",
        labelEn: "View in Community",
        exact: false,
      };
    }
    return {
      href,
      labelKo: "거래에서 보기",
      labelEn: "View in Trade",
      exact: false,
    };
  }
  if (isAdsDomainRootLiveHref(href) && boost) {
    return null;
  }
  return {
    href,
    labelKo: "실제 노출 보기",
    labelEn: "View live",
    exact: true,
  };
}

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
  const domain = String(input.domain ?? "").toLowerCase();

  // Boost: never claim domain roots as exact live exposure.
  if (domain === "community_promote" || domain === "trade_promote") {
    return null;
  }

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

  if (kind.includes("community") || domain === "community") {
    return "/philife";
  }
  if (kind.includes("trade") || kind.includes("boost") || domain === "trade") {
    return "/market";
  }

  return null;
}

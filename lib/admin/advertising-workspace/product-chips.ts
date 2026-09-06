/**
 * One-page Ads workspace product chips — Launch sellable only (FINAL LOCK).
 * FUTURE / NOT_SELLABLE placements are never offered in ops chips.
 */

export type AdvertisingWorkspaceDomain = "all" | "community" | "trade" | "delivery";

export type AdvertisingWorkspaceProductId =
  | "all"
  | "boost"
  | "feed_banner"
  | "sponsored"
  | "banner_hero"
  | "popup";

export type AdvertisingWorkspaceProductChip = {
  id: AdvertisingWorkspaceProductId;
  labelKo: string;
  labelEn: string;
};

export const ADVERTISING_WORKSPACE_PRODUCTS_BY_DOMAIN: Record<
  Exclude<AdvertisingWorkspaceDomain, "all">,
  AdvertisingWorkspaceProductChip[]
> = {
  community: [
    { id: "all", labelKo: "전체 광고", labelEn: "All" },
    { id: "boost", labelKo: "게시물 상위노출", labelEn: "Post boost" },
    { id: "feed_banner", labelKo: "피드 배너", labelEn: "Feed banner" },
    { id: "popup", labelKo: "팝업", labelEn: "Popup" },
  ],
  trade: [
    { id: "all", labelKo: "전체 광고", labelEn: "All" },
    { id: "boost", labelKo: "게시물 상위노출", labelEn: "Post boost" },
    { id: "feed_banner", labelKo: "피드 배너", labelEn: "Feed banner" },
    { id: "popup", labelKo: "팝업", labelEn: "Popup" },
  ],
  delivery: [
    { id: "all", labelKo: "전체 광고", labelEn: "All" },
    { id: "sponsored", labelKo: "매장 상위홍보", labelEn: "Store sponsored" },
    { id: "banner_hero", labelKo: "홈 상단 배너", labelEn: "Home hero banner" },
    { id: "popup", labelKo: "팝업", labelEn: "Popup" },
  ],
};

export function mapControlDomainToWorkspace(
  domain: string
): Exclude<AdvertisingWorkspaceDomain, "all"> | null {
  if (domain === "delivery") return "delivery";
  if (domain === "feed") return null; // feed spans trade+community — use placement
  if (domain === "popup") return null;
  if (domain === "trade_promote") return "trade";
  if (domain === "community_promote") return "community";
  return null;
}

export function rowMatchesWorkspaceFilter(input: {
  domain: string;
  product: string;
  placementHint: string | null;
  workspaceDomain: AdvertisingWorkspaceDomain;
  productId: AdvertisingWorkspaceProductId;
}): boolean {
  const { workspaceDomain, productId } = input;
  const d = mapControlDomainToWorkspace(input.domain);
  const placement = String(input.placementHint ?? input.product ?? "").toUpperCase();
  const product = String(input.product ?? "").toLowerCase();

  if (workspaceDomain === "community") {
    if (input.domain === "community_promote") {
      return productId === "all" || productId === "boost";
    }
    if (input.domain === "feed" && (placement.includes("COMMUNITY") || product.includes("feed"))) {
      return productId === "all" || productId === "feed_banner";
    }
    if (input.domain === "popup") {
      return productId === "all" || productId === "popup";
    }
    return false;
  }

  if (workspaceDomain === "trade") {
    if (input.domain === "trade_promote") {
      return productId === "all" || productId === "boost";
    }
    if (input.domain === "feed" && (placement.includes("TRADE") || product.includes("feed"))) {
      return productId === "all" || productId === "feed_banner";
    }
    if (input.domain === "popup") {
      return productId === "all" || productId === "popup";
    }
    return false;
  }

  if (workspaceDomain === "delivery") {
    if (input.domain === "delivery") {
      if (productId === "all") return true;
      if (productId === "sponsored") {
        return product.includes("sponsored") || placement.includes("FEED");
      }
      if (productId === "banner_hero") {
        return (
          placement.includes("HERO") ||
          product.includes("hero") ||
          product.includes("banner")
        );
      }
      if (productId === "popup") return false;
      return false;
    }
    if (input.domain === "popup") {
      return productId === "all" || productId === "popup";
    }
    return false;
  }

  // all domains
  if (productId === "all") return true;
  if (productId === "boost") {
    return input.domain === "trade_promote" || input.domain === "community_promote";
  }
  if (productId === "feed_banner") return input.domain === "feed";
  if (productId === "popup") return input.domain === "popup";
  if (productId === "sponsored") {
    return input.domain === "delivery" && (product.includes("sponsored") || placement.includes("FEED"));
  }
  if (productId === "banner_hero") {
    return (
      input.domain === "delivery" &&
      (placement.includes("HERO") || product.includes("hero") || product.includes("banner"))
    );
  }
  void d;
  return true;
}

/**
 * Admin Boost order deep-link — `/admin/advertising/boosts?orderId=<uuid>`.
 */
import { describe, expect, it } from "vitest";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";
import {
  ADS_BOOST_ORDER_URL_PARAM,
  adsBoostOrderDeepLinkHref,
  findBoostActionItemByOrderId,
  isAdsBoostOrderIdParam,
  resolveAdsBoostOrderFocusState,
} from "@/lib/admin/ads-exposure/boost-order-deep-link";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMMUNITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRADE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MISSING_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function boostItem(
  domain: "community_promote" | "trade_promote",
  orderId: string
): AdsActionItem {
  const prefix = domain === "community_promote" ? "community_promo" : "trade_promo";
  return {
    id: `${prefix}:${orderId}`,
    domain,
    product: domain === "community_promote" ? "community_promote_7" : "trade_promote_7",
    entity: "execution",
    applicantLabel: `target-${orderId.slice(0, 8)}`,
    storeId: null,
    memberId: "user-1",
    creativeHint: null,
    placementHint: null,
    amountLabel: "500P",
    currency: "POINT",
    status: "active",
    whyActionable: null,
    paymentLabel: "Point",
    periodLabel: null,
    remainingLabel: null,
    exposureLabel: null,
    eligibility: null,
    ageHours: null,
    at: new Date().toISOString(),
    source: "point_promotion_orders",
    href: "/admin/advertising/boosts",
    statementHref: null,
    financeHref: null,
    memberHref: null,
    sourceKind: "member",
  };
}

describe("ads boost order deep-link", () => {
  it("A — valid Community Boost order id resolves exact item", () => {
    const pool = [
      boostItem("trade_promote", TRADE_ID),
      boostItem("community_promote", COMMUNITY_ID),
    ];
    const hit = findBoostActionItemByOrderId(pool, COMMUNITY_ID);
    expect(hit?.id).toBe(`community_promo:${COMMUNITY_ID}`);
    expect(hit?.domain).toBe("community_promote");
    expect(resolveAdsBoostOrderFocusState({ orderIdRaw: COMMUNITY_ID, matched: hit })).toBe(
      "matched"
    );
  });

  it("B — valid Trade Boost order id resolves exact item", () => {
    const pool = [
      boostItem("community_promote", COMMUNITY_ID),
      boostItem("trade_promote", TRADE_ID),
    ];
    const hit = findBoostActionItemByOrderId(pool, TRADE_ID);
    expect(hit?.id).toBe(`trade_promo:${TRADE_ID}`);
    expect(hit?.domain).toBe("trade_promote");
  });

  it("C — nonexistent id fail-closed (no auto-select)", () => {
    const pool = [boostItem("community_promote", COMMUNITY_ID)];
    const hit = findBoostActionItemByOrderId(pool, MISSING_ID);
    expect(hit).toBeNull();
    expect(
      resolveAdsBoostOrderFocusState({ orderIdRaw: MISSING_ID, matched: hit })
    ).toBe("not_found");
  });

  it("D — invalid id fail-closed / no match", () => {
    expect(isAdsBoostOrderIdParam("not-a-uuid")).toBe(false);
    expect(isAdsBoostOrderIdParam("")).toBe(false);
    const pool = [boostItem("trade_promote", TRADE_ID)];
    expect(findBoostActionItemByOrderId(pool, "not-a-uuid")).toBeNull();
    expect(
      resolveAdsBoostOrderFocusState({ orderIdRaw: "bogus", matched: null })
    ).toBe("invalid");
  });

  it("canonical URL uses orderId param", () => {
    expect(ADS_BOOST_ORDER_URL_PARAM).toBe("orderId");
    expect(adsBoostOrderDeepLinkHref(TRADE_ID)).toBe(
      `/admin/advertising/boosts?orderId=${TRADE_ID}`
    );
  });

  it("F — workspace wires URL focus without new Admin page", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/ads/AdminAdvertisingWorkspace.tsx"),
      "utf8"
    );
    expect(src).toContain("ADS_BOOST_ORDER_URL_PARAM");
    expect(src).toContain("findBoostActionItemByOrderId");
    expect(src).toContain("data-admin-boost-order-focus");
    expect(src).toContain("data-admin-boost-order-detail");
    expect(src).not.toContain("/admin/advertising/boosts/[");
  });

  it("control plane ensure path is optional orderId only", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/ads-control-plane/route.ts"),
      "utf8"
    );
    const loader = readFileSync(
      join(process.cwd(), "lib/admin/ads-control-plane/load-ads-control-plane.ts"),
      "utf8"
    );
    expect(route).toContain("ensureBoostOrderId");
    expect(loader).toContain("ensureBoostOrderId");
    expect(loader).toContain("point_promotion_orders");
  });
});

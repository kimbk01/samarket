import { describe, expect, it } from "vitest";
import {
  browseShowsGenericCouponBadge,
  resolveStoreCouponDetailUxState,
} from "@/lib/stores/store-coupon-detail-ux";

describe("CUT UI-4 discovery + store detail coupon UX", () => {
  it("browse generic badge is presence-only, not campaign title", () => {
    expect(browseShowsGenericCouponBadge({ "s1": { title: "" } }, "s1")).toBe(true);
    expect(browseShowsGenericCouponBadge({ "s1": { title: "₱100 off" } }, "s1")).toBe(true);
    expect(browseShowsGenericCouponBadge({ "s1": { title: "" } }, "s2")).toBe(false);
    expect(browseShowsGenericCouponBadge({}, "s1")).toBe(false);
  });

  it("detail states: login / claim / held / unusable", () => {
    expect(resolveStoreCouponDetailUxState({ authed: false, hasCampaign: true, claimed: false })).toBe("login");
    expect(resolveStoreCouponDetailUxState({ authed: true, hasCampaign: true, claimed: false })).toBe("claim");
    expect(resolveStoreCouponDetailUxState({ authed: true, hasCampaign: true, claimed: true })).toBe("held");
    expect(
      resolveStoreCouponDetailUxState({
        authed: true,
        hasCampaign: false,
        claimed: false,
        ineligibleReason: "first_order_ineligible",
      })
    ).toBe("unusable");
    expect(resolveStoreCouponDetailUxState({ authed: true, hasCampaign: false, claimed: false })).toBe("hidden");
  });
});

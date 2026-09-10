import { describe, expect, it } from "vitest";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";

/**
 * Contract: comment post existence must match like engagement visibility.
 * Missing location_id alone must not fake not_found for a real community_posts.id
 * (member or imported).
 */
describe("community comment eligibility vs like", () => {
  it("active imported row without location_id is publicly visible", () => {
    expect(
      isCommunityPostPubliclyVisible({
        status: "active",
        is_deleted: false,
        is_hidden: false,
      })
    ).toBe(true);
  });

  it("hidden/deleted status remain not visible", () => {
    expect(isCommunityPostPubliclyVisible({ status: "hidden" })).toBe(false);
    expect(isCommunityPostPubliclyVisible({ status: "deleted" })).toBe(false);
  });
});

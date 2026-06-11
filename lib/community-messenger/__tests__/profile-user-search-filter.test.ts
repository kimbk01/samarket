import { describe, expect, it } from "vitest";
import {
  buildProfileUserSearchOrFilter,
  normalizeProfileUserSearchKeyword,
} from "@/lib/community-messenger/profile-user-search-filter";

describe("profile-user-search-filter", () => {
  it("strips @ prefix and commas from keyword", () => {
    expect(normalizeProfileUserSearchKeyword("@Samarket")).toBe("samarket");
    expect(normalizeProfileUserSearchKeyword("foo,bar")).toBe("foobar");
  });

  it("builds dibay_id exact ilike filter with legacy confirmed username", () => {
    expect(buildProfileUserSearchOrFilter("samarket")).toBe(
      'dibay_id.ilike."samarket",and(username.ilike."samarket",username_confirmed.eq.true)'
    );
    expect(buildProfileUserSearchOrFilter("@Samarket")).toBe(
      'dibay_id.ilike."samarket",and(username.ilike."samarket",username_confirmed.eq.true)'
    );
  });

  it("escapes ilike wildcards and quotes", () => {
    expect(buildProfileUserSearchOrFilter('100%_"x"')).toBe(
      'dibay_id.ilike."100\\\\%\\\\_\\"x\\"",and(username.ilike."100\\\\%\\\\_\\"x\\"",username_confirmed.eq.true)'
    );
  });

  it("returns null for empty keyword", () => {
    expect(buildProfileUserSearchOrFilter("")).toBeNull();
    expect(buildProfileUserSearchOrFilter("@")).toBeNull();
  });
});

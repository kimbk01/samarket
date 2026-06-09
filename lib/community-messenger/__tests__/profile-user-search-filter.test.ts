import { describe, expect, it } from "vitest";
import {
  buildProfileUserSearchOrFilter,
  normalizeProfileUserSearchKeyword,
} from "@/lib/community-messenger/profile-user-search-filter";

describe("profile-user-search-filter", () => {
  it("strips @ prefix and commas from keyword", () => {
    expect(normalizeProfileUserSearchKeyword("@samarket")).toBe("samarket");
    expect(normalizeProfileUserSearchKeyword("foo,bar")).toBe("foobar");
  });

  it("builds quoted or filter for safe keywords", () => {
    expect(buildProfileUserSearchOrFilter("samarket")).toBe(
      'username.ilike."%samarket%",nickname.ilike."%samarket%",display_name.ilike."%samarket%"'
    );
  });

  it("escapes ilike wildcards and quotes", () => {
    expect(buildProfileUserSearchOrFilter('100%_"x"')).toBe(
      'username.ilike."%100\\\\%\\\\_\\"x\\"%",nickname.ilike."%100\\\\%\\\\_\\"x\\"%",display_name.ilike."%100\\\\%\\\\_\\"x\\"%"'
    );
  });

  it("returns null for empty keyword", () => {
    expect(buildProfileUserSearchOrFilter("")).toBeNull();
    expect(buildProfileUserSearchOrFilter("@")).toBeNull();
  });
});

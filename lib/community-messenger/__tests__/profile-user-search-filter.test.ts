import { describe, expect, it } from "vitest";
import {
  escapeIlikePatternFragment,
  escapePostgrestDoubleQuotedIlike,
  normalizeProfileUserSearchKeyword,
} from "@/lib/community-messenger/profile-user-search-filter";

describe("profile-user-search-filter", () => {
  it("strips @ prefix and commas from keyword", () => {
    expect(normalizeProfileUserSearchKeyword("@Samarket")).toBe("samarket");
    expect(normalizeProfileUserSearchKeyword("foo,bar")).toBe("foobar");
  });

  it("escapes ilike wildcards and quotes", () => {
    expect(escapeIlikePatternFragment('100%_x')).toBe("100\\%\\_x");
    expect(escapePostgrestDoubleQuotedIlike('a"b')).toBe('"a\\"b"');
  });
});

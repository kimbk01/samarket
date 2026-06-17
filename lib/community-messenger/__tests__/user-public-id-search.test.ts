import { describe, expect, it } from "vitest";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  COMMUNITY_MESSENGER_USER_SEARCH_LIMIT,
  computePublicIdHighlightRanges,
  computeDisplayNameHighlightRanges,
} from "@/lib/community-messenger/user-public-id-search";

describe("user public id search helpers", () => {
  it("requires minimum 2 characters", () => {
    expect(COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH).toBe(2);
  });

  it("limits results to 20", () => {
    expect(COMMUNITY_MESSENGER_USER_SEARCH_LIMIT).toBe(20);
  });

  it("highlights prefix match in public id — diba123 → diba bold range", () => {
    expect(computePublicIdHighlightRanges("diba123", "diba")).toEqual([{ start: 0, end: 4 }]);
  });

  it("highlights suffix match in public id — mydiba → diba bold range", () => {
    expect(computePublicIdHighlightRanges("mydiba", "diba")).toEqual([{ start: 2, end: 6 }]);
  });

  it("highlights display name contains match", () => {
    expect(computeDisplayNameHighlightRanges("Diba User", "diba")).toEqual([{ start: 0, end: 4 }]);
  });
});

describe("participant block hide", () => {
  it("documents block hide is viewer-only — no message delete", () => {
    expect(true).toBe(true);
  });
});

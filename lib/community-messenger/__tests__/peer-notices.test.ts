import { describe, expect, it } from "vitest";
import {
  shouldShowUnknownPeerNotice,
} from "@/lib/community-messenger/peer-notices";

describe("shouldShowUnknownPeerNotice", () => {
  it("hides when peer is saved as friend", () => {
    expect(
      shouldShowUnknownPeerNotice({ isFriend: true, blockedByMe: false, dismissed: false })
    ).toBe(false);
  });

  it("hides when viewer dismissed the notice", () => {
    expect(
      shouldShowUnknownPeerNotice({ isFriend: false, blockedByMe: false, dismissed: true })
    ).toBe(false);
  });

  it("hides when blocked (block bar is separate)", () => {
    expect(
      shouldShowUnknownPeerNotice({ isFriend: false, blockedByMe: true, dismissed: false })
    ).toBe(false);
  });

  it("shows for unsaved peer not dismissed", () => {
    expect(
      shouldShowUnknownPeerNotice({ isFriend: false, blockedByMe: false, dismissed: false })
    ).toBe(true);
  });
});

describe("peer notice policy", () => {
  it("dismiss does not imply block or friend — visibility only", () => {
    expect(
      shouldShowUnknownPeerNotice({ isFriend: false, blockedByMe: false, dismissed: true })
    ).toBe(false);
    expect(
      shouldShowUnknownPeerNotice({ isFriend: false, blockedByMe: false, dismissed: false })
    ).toBe(true);
  });
});

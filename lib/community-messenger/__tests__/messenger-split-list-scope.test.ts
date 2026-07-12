import { describe, expect, it } from "vitest";
import {
  parseMessengerSplitListScopeFromPathname,
  resolveMessengerSplitListScope,
} from "@/lib/community-messenger/messenger-split-list-scope";

describe("messenger-split-list-scope", () => {
  it("parses pillar list routes from pathname", () => {
    expect(parseMessengerSplitListScopeFromPathname("/community-messenger/trade-chats")).toBe("trade");
    expect(parseMessengerSplitListScopeFromPathname("/community-messenger/delivery-chats")).toBe("delivery");
    expect(parseMessengerSplitListScopeFromPathname("/community-messenger")).toBe("inbox");
  });

  it("uses cm_list on room routes", () => {
    expect(
      resolveMessengerSplitListScope({
        pathname: "/community-messenger/rooms/abc",
        cmList: "trade",
      })
    ).toBe("trade");
    expect(
      resolveMessengerSplitListScope({
        pathname: "/community-messenger/rooms/abc",
        cmList: "delivery",
      })
    ).toBe("delivery");
    expect(
      resolveMessengerSplitListScope({
        pathname: "/community-messenger/rooms/abc",
        cmList: null,
      })
    ).toBe("inbox");
  });
});

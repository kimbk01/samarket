import { describe, expect, it } from "vitest";
import { resolveMainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

describe("resolveMainBottomNavSecondaryRailKind", () => {
  it("메신저 trade-chats 경로는 from 없어도 trade 레일", () => {
    expect(resolveMainBottomNavSecondaryRailKind("/community-messenger/trade-chats", null)).toBe("trade");
  });

  it("메신저 delivery-chats 경로는 stores 레일", () => {
    expect(resolveMainBottomNavSecondaryRailKind("/community-messenger/delivery-chats", null)).toBe("stores");
  });
});

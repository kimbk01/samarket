import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("healTradeStoreOrderBadgeDerivedFromParticipants contract", () => {
  it("heals targets from participants and never mass-reads status events", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "lib/notifications/heal-trade-store-order-badge-derived-from-participants.ts"
      ),
      "utf8"
    );
    expect(src).toContain("loadTradeStoreOrderUnreadRoomFactsFromParticipants");
    expect(src).toContain("TRADE_UNREAD_TARGET_TYPE");
    expect(src).toContain("STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE");
    expect(src).toContain("STORE_ORDER_OWNER_UNREAD_TARGET_TYPE");
    expect(src).toContain("phantom");
    expect(src).not.toContain("order_status");
    expect(src).not.toContain("trade_status");
    expect(src).not.toContain("markOrderNotificationEventsRead");
  });

  it("documents status lifecycle without mass-read", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/notifications/status-event-read-lifecycle.md"),
      "utf8"
    );
    expect(doc).toContain("Forbidden");
    expect(doc).toContain("markOrderNotificationsRead");
    expect(doc).toContain("trade_detail_opened");
  });
});

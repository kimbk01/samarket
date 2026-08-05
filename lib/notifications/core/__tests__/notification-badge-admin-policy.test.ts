import { describe, expect, it } from "vitest";
import { countNotificationEventsBadge } from "@/lib/notifications/core/notification-event-repository";

function fakeBadgeSb(rows: Array<{ category: string; display_payload?: Record<string, unknown>; muted_snapshot?: boolean }>) {
  const q = {
    select: () => q,
    eq: () => q,
    is: async () => ({ data: rows, error: null }),
  };
  return {
    // No `rpc` here → repository RPC attempt throws → row-scan fallback (legacy semantics kept).
    from: () => q,
  } as unknown;
}

/** sb whose COUNT RPC returns the modern taxonomy shape (migration applied). */
function fakeBadgeRpcSb(rpcResult: Record<string, number>) {
  return {
    rpc: async () => ({ data: rpcResult, error: null }),
    from: () => {
      throw new Error("row-scan must not run when modern RPC is available");
    },
  } as unknown;
}

describe("notification badge admin policy", () => {
  it("excludes admin_marketing_banner from total when badge is disabled", async () => {
    const sb = fakeBadgeSb([
      { category: "admin_marketing_banner" },
      { category: "admin_marketing_banner" },
      { category: "chat_message" },
    ]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.adminMarketingBanner).toBe(2);
    expect(out.chatMessage).toBe(1);
    expect(out.total).toBe(1);
  });

  it("keeps admin_notice countable in total", async () => {
    const sb = fakeBadgeSb([{ category: "admin_notice" }, { category: "admin_notice" }]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.adminNotice).toBe(2);
    expect(out.total).toBe(2);
  });

  it("folds inquiry_answered + inbox_message_received into adminNotice (Phase 5 Slice 1)", async () => {
    const sb = fakeBadgeSb([
      { category: "inquiry_answered" },
      { category: "inbox_message_received" },
      { category: "admin_notice" },
    ]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.adminNotice).toBe(3);
    expect(out.total).toBe(3);
  });

  it("folds notice_published into adminNotice (Phase 5 Slice 2)", async () => {
    const sb = fakeBadgeSb([{ category: "notice_published" }, { category: "notice_published" }]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.adminNotice).toBe(2);
    expect(out.total).toBe(2);
  });

  it("excludes events with explicit badge-disabled, expired, deleted, or mute_badge policy", async () => {
    const sb = fakeBadgeSb([
      { category: "chat_message", display_payload: { badge_enabled: false } },
      { category: "chat_message", display_payload: { expired_at: "2000-01-01T00:00:00.000Z" } },
      { category: "chat_message", display_payload: { deleted_at: "2026-01-01T00:00:00.000Z" } },
      { category: "chat_message", display_payload: { mute_badge: true } },
      { category: "chat_message", display_payload: { mute_sound: true } },
    ]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.chatMessage).toBe(1);
    expect(out.total).toBe(1);
  });

  it("uses the modern COUNT RPC result when available (no row scan)", async () => {
    const sb = fakeBadgeRpcSb({
      chat_message: 3,
      group_message: 1,
      trade_message: 2,
      trade_status: 1,
      order_status: 4,
      delivery_status: 0,
      community_activity: 0,
      admin_marketing_banner: 5, // excluded from total
      admin_notice: 2,
      missed_call: 1,
    });
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.chatMessage).toBe(3);
    expect(out.trade).toBe(3); // trade_message + trade_status
    expect(out.store).toBe(4); // order_status + delivery_status
    expect(out.adminMarketingBanner).toBe(5);
    // total excludes admin_marketing_banner
    expect(out.total).toBe(3 + 1 + 2 + 1 + 4 + 0 + 0 + 2 + 1);
  });

  it("ignores a legacy-shape RPC result and falls back to row scan", async () => {
    // Old deployed RPC returns only legacy keys → not modern shape → row scan runs.
    const legacyRows = [{ category: "chat_message" }, { category: "admin_notice" }];
    const q = {
      select: () => q,
      eq: () => q,
      is: async () => ({ data: legacyRows, error: null }),
    };
    const sb = {
      rpc: async () => ({ data: { chat: 99, group: 0, trade: 0, store: 0, missed_call: 0 }, error: null }),
      from: () => q,
    } as unknown;
    const out = await countNotificationEventsBadge(sb as never, "u1");
    // legacy RPC (chat:99) ignored; row scan → chatMessage 1 + adminNotice 1
    expect(out.chatMessage).toBe(1);
    expect(out.adminNotice).toBe(1);
    expect(out.total).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readOrderChat } from "@/lib/order-domain/read-order-chat";
import { DIBAY_MARK_ROOM_READ_ATOMIC_RPC } from "@/lib/messenger/contracts/room-unread-authority";

const src = readFileSync(join(process.cwd(), "lib/order-domain/read-order-chat.ts"), "utf8");

describe("OrderDomain.readOrderChat → Room Unread Authority v1", () => {
  it("exports the Order Domain read API", () => {
    expect(typeof readOrderChat).toBe("function");
  });

  it("routes through dibay_mark_room_read_atomic (no Promise.all counter-only read)", () => {
    expect(src).toContain(DIBAY_MARK_ROOM_READ_ATOMIC_RPC);
    expect(src).toContain('p_chat_domain: "store_order"');
    expect(src).toContain("authority: \"room_unread_v1\"");
    expect(src).not.toContain("markOrderParticipantRead");
    expect(src).not.toContain("markOrderChatEventsRead");
    expect(src).not.toContain('.update({ unread_count: 0');
    expect(src).not.toMatch(/\.rpc\(\s*["']community_messenger_apply_room_read_mark/);
  });

  it("passes customer/owner role and store/order identity into mark-read RPC", () => {
    expect(src).toContain("p_viewer_role: ctx.role");
    expect(src).toContain("p_order_id: ctx.orderId");
    expect(src).toContain("p_store_id: ctx.storeId");
    expect(src).toContain("domainIdentityKey: `store_order:${orderId}`");
  });

  it("scopes open_tail idempotency by tip message id (read-clear after new messages)", () => {
    expect(src).toContain("buildSoMarkReadIdempotencyKey");
    expect(src).toContain("resolveRoomReadableTipMessageId");
    expect(src).not.toMatch(/through \?\? "open_tail"/);
  });
});
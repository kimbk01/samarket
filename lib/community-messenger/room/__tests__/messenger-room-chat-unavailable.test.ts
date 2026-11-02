import { describe, expect, it } from "vitest";
import { resolveMessengerRoomChatUnavailable } from "@/lib/community-messenger/room/messenger-room-chat-unavailable";

const PEER = "peer-1";

function snap(over: {
  room?: Record<string, unknown>;
  members?: Array<{ id: string; blocked?: boolean }>;
  directMessageDenied?: "blocked" | "rejected_by_peer" | null;
  tradeMessaging?: { canSendMessage: boolean; denyCode: string | null; denyMessage: string | null } | null;
  clientShellPlaceholder?: boolean;
}) {
  return {
    room: { peerUserId: PEER, roomStatus: "active", isReadonly: false, deletedAt: null, contextMeta: null, ...over.room },
    members: over.members ?? [{ id: PEER }],
    directMessageDenied: over.directMessageDenied ?? null,
    tradeMessaging: over.tradeMessaging ?? null,
    clientShellPlaceholder: over.clientShellPlaceholder,
  } as never;
}

const resolve = (s: ReturnType<typeof snap>, roomUnavailable = true) =>
  resolveMessengerRoomChatUnavailable({ snapshot: s, roomUnavailable });

describe("resolveMessengerRoomChatUnavailable — 서버 발송 거부 코드 SSOT", () => {
  it("usable room / client shell → no bar", () => {
    expect(resolve(snap({}), false)).toBeNull();
    expect(resolve(snap({ directMessageDenied: "blocked", clientShellPlaceholder: true }))).toBeNull();
  });

  it("server gate order: deleted → admin blocked → archived → readonly", () => {
    expect(resolve(snap({ room: { deletedAt: "x", roomStatus: "blocked" } }))?.code).toBe("room_deleted");
    expect(resolve(snap({ room: { roomStatus: "blocked", isReadonly: true } }))?.code).toBe("room_blocked");
    expect(resolve(snap({ room: { roomStatus: "archived", isReadonly: true } }))?.code).toBe("room_archived");
    expect(resolve(snap({ room: { isReadonly: true }, directMessageDenied: "blocked" }))?.code).toBe("room_readonly");
  });

  it("I blocked the peer → blocked_target with reason", () => {
    expect(resolve(snap({ directMessageDenied: "blocked", members: [{ id: PEER, blocked: true }] }))).toMatchObject({
      code: "blocked_target",
      hideReason: false,
    });
  });

  it("peer blocked me → title only (Owner 결정)", () => {
    expect(resolve(snap({ directMessageDenied: "blocked" }))).toMatchObject({ code: "blocked_target", hideReason: true });
  });

  it("rejected_by_peer", () => {
    expect(resolve(snap({ directMessageDenied: "rejected_by_peer" }))?.code).toBe("rejected_by_peer");
  });

  it("trade deny → trade code + 상품 보기 대상", () => {
    expect(
      resolve(snap({ tradeMessaging: { canSendMessage: false, denyCode: "trade_seller_closed_buyer_blocked", denyMessage: "m" } }))
    ).toMatchObject({ code: "trade_seller_closed_buyer_blocked", isTrade: true, fallbackMessage: "m" });
  });

  it("completed / cancelled store order (delivery rooms too)", () => {
    expect(resolve(snap({ room: { contextMeta: { kind: "delivery", orderStatus: "cancelled" } } }))?.code).toBe(
      "store_order_chat_closed"
    );
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const bootstrapSnap = {
  viewerUserId: "buyer-1",
  myRole: "member" as const,
  room: {
    id: "room-a",
    roomType: "direct" as const,
    unreadCount: 0,
    lastMessage: "hello",
    contextMeta: {
      v: 1 as const,
      kind: "delivery" as const,
      storeOrderId: "ord-1",
      storeId: "store-1",
      headline: "테스트 주문",
    },
  },
  members: [],
  messages: [
    {
      id: "m1",
      roomId: "room-a",
      senderId: "buyer-1",
      senderLabel: "me",
      messageType: "text" as const,
      content: "hi",
      createdAt: "2026-01-01T00:00:00.000Z",
      isMine: true,
      clientMessageId: null,
      callKind: null,
      callStatus: null,
      callSessionId: null,
    },
  ],
  readReceipt: null,
  activeCall: null,
} as unknown as CommunityMessengerRoomSnapshot;

describe("prepareStoreOrderMessengerRoomEntryByRoomId", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/ensure-chat") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              community_messenger_room_id: "room-a",
              order_chat_ready: true,
              roomSnapshot: bootstrapSnap,
            }),
            { status: 200 }
          );
        }
        if (url.includes("/bootstrap")) {
          return new Response(JSON.stringify({ ok: true, ...bootstrapSnap, bootstrap: true }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ensure 응답 roomSnapshot 으로 주문 방 히스토리를 준비한다", async () => {
    const { prepareStoreOrderMessengerRoomEntryByRoomId } = await import(
      "@/lib/store-order-chat/store-order-messenger-room-entry-client"
    );
    const result = await prepareStoreOrderMessengerRoomEntryByRoomId("room-a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.roomId).toBe("room-a");
    expect(result.snapshot.messages.length).toBeGreaterThan(0);
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("ensure-chat"))).toBe(true);
  });

  it("cm_ctx storeOrderId 가 있으면 bootstrap GET 없이 ensure 만 호출한다", async () => {
    const { prepareStoreOrderMessengerRoomEntryByRoomId } = await import(
      "@/lib/store-order-chat/store-order-messenger-room-entry-client"
    );
    const result = await prepareStoreOrderMessengerRoomEntryByRoomId("room-a", {
      instantContextMeta: {
        v: 1,
        kind: "delivery",
        headline: "테스트",
        storeOrderId: "ord-1",
        storeId: "store-1",
      },
      myRole: "member",
    });
    expect(result.ok).toBe(true);
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("ensure-chat"))).toBe(true);
    expect(urls.some((u) => u.includes("bootstrap"))).toBe(false);
  });
});

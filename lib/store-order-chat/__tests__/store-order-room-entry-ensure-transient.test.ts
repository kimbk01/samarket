/**
 * 주문 채팅 방 진입(roomId) — bootstrap 성공 뒤 ensure-chat 이 서버 일시 오류(5xx·408·429)를 내면
 * 접근 거부 결과(`ok:false` → 게이트 리다이렉트)가 아니라 재시도 가능한 실패(throw → 게이트 다시 시도)로 전달한다.
 * 401·403·404 는 기존 `ok:false` 계약 유지.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const bootstrapSnap = {
  viewerUserId: "buyer-1",
  myRole: "member" as const,
  room: {
    id: "room-a",
    roomType: "direct" as const,
    unreadCount: 0,
    lastMessage: "hello",
    contextMeta: { v: 1 as const, kind: "delivery" as const, storeOrderId: "ord-1", storeId: "store-1", headline: "주문" },
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

let ensureStatus = 200;
let ensureCalls = 0;

beforeEach(() => {
  vi.resetModules();
  ensureStatus = 200;
  ensureCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/ensure-chat") && init?.method === "POST") {
        ensureCalls += 1;
        if (ensureStatus !== 200) {
          return new Response(JSON.stringify({ ok: false, error: "ensure_exception" }), { status: ensureStatus });
        }
        return new Response(
          JSON.stringify({ ok: true, community_messenger_room_id: "room-a", order_chat_ready: true, roomSnapshot: bootstrapSnap }),
          { status: 200 },
        );
      }
      if (url.includes("/bootstrap")) {
        return new Response(JSON.stringify({ ok: true, ...bootstrapSnap }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function prepare() {
  const { prepareStoreOrderMessengerRoomEntryByRoomId } = await import(
    "@/lib/store-order-chat/store-order-messenger-room-entry-client"
  );
  return prepareStoreOrderMessengerRoomEntryByRoomId("room-a").then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );
}

describe("주문 채팅 진입 — ensure-chat 상태 분류", () => {
  it.each([500, 503, 408, 429])("ensure %i → 일시 오류(throw), 접근 거부 결과 아님", async (status) => {
    ensureStatus = status;
    const r = await prepare();
    expect(r.value).toBeNull();
    expect((r.error as Error)?.name).toBe("StoreOrderChatEnsureTransientError");
    expect(ensureCalls).toBe(1);
  });

  it.each([401, 403, 404])("ensure %i → 기존 계약(ok:false) 유지", async (status) => {
    ensureStatus = status;
    const r = await prepare();
    expect(r.error).toBeNull();
    expect(r.value?.ok).toBe(false);
  });

  it("ensure 200 → 정상 진입(기존 동작)", async () => {
    const r = await prepare();
    expect(r.error).toBeNull();
    expect(r.value?.ok).toBe(true);
    expect(ensureCalls).toBe(1);
  });

  it("일시 오류 뒤 재시도는 ensure 를 다시 1회 호출하고 정상 진입한다", async () => {
    ensureStatus = 503;
    await prepare();
    ensureStatus = 200;
    const r = await prepare();
    expect(r.value?.ok).toBe(true);
    expect(ensureCalls).toBe(2);
  });
});

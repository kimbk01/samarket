/** @vitest-environment jsdom */
/**
 * 재감사 D-6 (P-7) — 오너 알림음.
 * ① 푸시 소리 키는 인앱과 같은 resolver(kind·수신 역할) — 오너 주문이 고객 주문 소리로 울리지 않는다.
 * ② 회원 「앱 안 알림음」 끔은 회원 소리만 끈다 — 오너 소리는 오너 설정(상위 게이트)이 판정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPushPayload } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import {
  __resetNotificationSoundDecisionForTests,
  decideNotificationSound,
} from "@/lib/notifications/notification-sound-decision";
import { syncNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate-snapshot";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playEventNotificationSound: vi.fn(async () => {}),
  resetNotificationSoundEngineForAuthEpoch: vi.fn(),
  playDomainNotificationSound: vi.fn(async () => {}),
}));

function eventRow(type: string, display_payload: Record<string, unknown>, room_id: string | null = null) {
  return {
    id: "e1",
    user_id: "u1",
    type,
    category: type,
    room_id,
    call_session_id: null,
    actor_user_id: null,
    message_id: null,
    title: "t",
    body: "b",
    display_payload,
    unread: true,
    read_at: null,
    delivered_at: null,
    opened_at: null,
    muted_snapshot: false,
    push_suppressed_reason: null,
    sound_suppressed_reason: null,
    dedupe_key: "k1",
    created_at: "2026-10-27T00:00:00.000Z",
  } as never;
}

const eventKeyOf = (row: never) => (buildPushPayload(row, 0).meta as { event_key?: string }).event_key;

describe("D-6 ① push sound key follows kind and receiver role", () => {
  it("owner new order uses the owner order sound, not the customer status sound", () => {
    expect(
      eventKeyOf(eventRow("order_status", { legacyMeta: { kind: "store_order_created", order_id: "o1" } }))
    ).toBe("delivery_order_created_owner");
  });

  it("legacy top-level owner kind resolves the same way", () => {
    expect(eventKeyOf(eventRow("order_status", { kind: "store_order_buyer_cancelled" }))).toBe(
      "delivery_order_cancelled_owner"
    );
  });

  it("buyer order status keeps the customer status sound", () => {
    expect(
      eventKeyOf(eventRow("order_status", { legacyMeta: { kind: "store_order_owner_status", order_id: "o1" } }))
    ).toBe("delivery_order_status_changed_user");
  });

  it("store order chat follows receiverRole", () => {
    expect(
      eventKeyOf(eventRow("store_order_message", { receiverRole: "owner", legacyMeta: { kind: "store_order_message" } }, "r1"))
    ).toBe("delivery_chat_message_received_owner");
  });

  it("1:1 chat without kind keeps the type default", () => {
    expect(eventKeyOf(eventRow("chat_message", {}, "r1"))).toBe("messenger_direct_message_received");
  });
});

describe("D-6 ② member in-app sound toggle does not mute owner sounds", () => {
  beforeEach(() => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: false,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
    __resetNotificationSoundDecisionForTests({
      recipientId: "u1",
      isLeader: true,
      callActive: false,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 1_000,
    });
  });

  const input = (id: string, recipientRole?: "member" | "owner") => ({
    identityKind: "member_event" as const,
    canonicalEventId: id,
    recipientId: "u1",
    eventType: "order_status",
    source: "realtime" as const,
    createdAt: new Date().toISOString(),
    recipientRole,
  });

  it("member recipient: muted by the member toggle", () => {
    expect(decideNotificationSound(input("n1", "member")).reason).toBe("SKIP_MUTED");
  });

  it("owner recipient: not muted by the member toggle", () => {
    expect(decideNotificationSound(input("n2", "owner")).reason).not.toBe("SKIP_MUTED");
  });
});

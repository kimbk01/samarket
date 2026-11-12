/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D7 (docs/audit/call-cancel-callee-missed-design-2026-11-13.md §11) — 부재중 배너 근거 = 부재중 알림 행 1건.
 * 실측: 발신자 취소는 안 읽은 수 판정 순간 WebView hidden(통화 화면이 닫히는 도중) → 배너 버려짐.
 */
const pushed: Array<Record<string, unknown>> = [];
vi.mock("@/lib/community-messenger/notifications/messenger-in-app-banner-store", () => ({
  pushMessengerInAppMessageBanner: (b: Record<string, unknown>) => pushed.push(b),
}));
let gate: { activeCommunityChatRoomId?: string | null; userNotificationSettings?: { community_chat_enabled?: boolean } } | null =
  null;
vi.mock("@/lib/notifications/notification-sound-gate-snapshot", () => ({
  getNotificationSoundGateSnapshot: () => gate,
}));
let unreadFact: { unreadCount: number } | null = null;
vi.mock("@/lib/community-messenger/unread/messenger-room-unread-authority", () => ({
  peekMessengerRoomUnreadFact: () => unreadFact,
}));
vi.mock("@/lib/community-messenger/bootstrap-cache", () => ({ peekBootstrapCache: () => null }));
vi.mock("@/lib/community-messenger/home-list-patch", () => ({ findHomeListRoomRow: () => null }));

import {
  __resetMissedCallEventBannerForTests,
  installMissedCallBannerNativeTerminalTracker,
  pushMessengerMissedCallBannerFromRealtimeRow,
} from "@/lib/community-messenger/notifications/missed-call-event-banner";

const ROOM = "1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const SESSION = "307b6e3f-e5c8-4b38-aca2-ed41718defb6";

function row(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "missed_call",
    user_id: "callee",
    actor_user_id: "caller",
    room_id: ROOM,
    call_session_id: SESSION,
    title: "부재중 전화",
    body: "q테스트1 · 부재중 음성 통화",
    muted_snapshot: false,
    display_payload: { callKind: "voice", caller_name: "q테스트1" },
    ...extra,
  };
}

let visibility: DocumentVisibilityState = "visible";
function setVisibility(v: DocumentVisibilityState): void {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  pushed.length = 0;
  gate = { activeCommunityChatRoomId: null, userNotificationSettings: { community_chat_enabled: true } };
  unreadFact = { unreadCount: 1 };
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  window.history.replaceState(null, "", "/community-messenger");
  __resetMissedCallEventBannerForTests();
  installMissedCallBannerNativeTerminalTracker();
});
afterEach(() => {
  __resetMissedCallEventBannerForTests();
});

describe("missed-call-event-banner (D7)", () => {
  it("보이는 상태 → 부재중 배너 1건 (문구 = 알림 행, 통화 1건 1키)", () => {
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row())).toBe(true);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      roomId: ROOM,
      title: "부재중 전화",
      preview: "q테스트1 · 부재중 음성 통화",
      kind: "missed_call",
      dedupeKey: `missed:${SESSION}`,
    });
  });

  it("부재중이 아닌 알림 행·방/세션 없음 → 없음", () => {
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row({ type: "chat_message" }))).toBe(false);
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row({ room_id: null }))).toBe(false);
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row({ call_session_id: "" }))).toBe(false);
    expect(pushed).toHaveLength(0);
  });

  it("그 대화방을 보고 있음 · 방 알림 끔 · 채팅 알림 끔 → 없음", () => {
    window.history.replaceState(null, "", `/community-messenger/rooms/${ROOM}`);
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row())).toBe(false);
    window.history.replaceState(null, "", "/community-messenger");
    gate = { activeCommunityChatRoomId: ROOM, userNotificationSettings: { community_chat_enabled: true } };
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row())).toBe(false);
    gate = { activeCommunityChatRoomId: null, userNotificationSettings: { community_chat_enabled: true } };
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row({ muted_snapshot: true }))).toBe(false);
    gate = { activeCommunityChatRoomId: null, userNotificationSettings: { community_chat_enabled: false } };
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row())).toBe(false);
    expect(pushed).toHaveLength(0);
  });

  it("D7-2: 숨김 + DIBAY 통화 화면에서 끝난 통화 → 보류했다가 다시 보일 때 1건", () => {
    window.dispatchEvent(new CustomEvent("dibay:call-event", { detail: { type: "call_terminal", sessionId: SESSION, status: "cancelled" } }));
    visibility = "hidden";
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row())).toBe(true);
    expect(pushed).toHaveLength(0);
    setVisibility("visible");
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ dedupeKey: `missed:${SESSION}`, kind: "missed_call" });
    setVisibility("hidden");
    setVisibility("visible");
    expect(pushed).toHaveLength(1);
  });

  it("D7-2: 숨김인데 통화 화면 종료 신호가 없던 통화(앱이 정말 뒤) → 보류 안 함(시스템 알림이 맡음)", () => {
    visibility = "hidden";
    expect(pushMessengerMissedCallBannerFromRealtimeRow(row())).toBe(false);
    setVisibility("visible");
    expect(pushed).toHaveLength(0);
  });

  it("D7-2: 보류 중 그 방을 열었거나 읽음(안 읽은 수 0) → 버림", () => {
    window.dispatchEvent(new CustomEvent("dibay:call-event", { detail: { type: "call_terminal", sessionId: SESSION } }));
    visibility = "hidden";
    pushMessengerMissedCallBannerFromRealtimeRow(row());
    unreadFact = { unreadCount: 0 };
    setVisibility("visible");
    expect(pushed).toHaveLength(0);

    pushMessengerMissedCallBannerFromRealtimeRow(row({ call_session_id: SESSION }));
    expect(pushed).toHaveLength(1);
    pushed.length = 0;
    visibility = "hidden";
    pushMessengerMissedCallBannerFromRealtimeRow(row());
    unreadFact = { unreadCount: 1 };
    window.history.replaceState(null, "", `/community-messenger/rooms/${ROOM}`);
    setVisibility("visible");
    expect(pushed).toHaveLength(0);
  });
});

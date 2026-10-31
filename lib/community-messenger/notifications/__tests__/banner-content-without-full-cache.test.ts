/**
 * 2026-10-31 iPhone 실기: 홈(/philife)·메신저 목록에서 메시지가 와도 앱 안 배너 0건(알림음은 남), 다른 방 안에서는 표시.
 * 원인: 배너 문구의 방 정보를 full 목록 캐시·방 스냅샷 「현재 값」에서만 찾아, 없으면 배너를 건너뛰었다.
 * 수정: critical 목록 캐시도 찾고, 둘 다 없으면 진행 중인 방 스냅샷 요청이 끝나기를 기다린다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  full: null as unknown,
  critical: null as unknown,
  snapAfterPrefetch: null as unknown,
  snapNow: null as unknown,
  prefetchCalls: 0,
  fact: null as unknown,
  pushes: [] as { title: string; preview: string }[],
}));

vi.mock("@/lib/community-messenger/bootstrap-cache", () => ({
  peekBootstrapCache: () => st.full,
  peekMessengerBootstrapCritical: () => st.critical,
}));
vi.mock("@/lib/community-messenger/room-snapshot-cache", () => ({
  peekRoomSnapshot: () => st.snapNow,
  prefetchCommunityMessengerRoomSnapshot: async () => {
    st.prefetchCalls += 1;
    st.snapNow = st.snapAfterPrefetch;
    return true;
  },
}));
vi.mock("@/lib/community-messenger/notifications/messenger-in-app-banner-store", () => ({
  useMessengerInAppMessageBannerStore: {
    getState: () => ({
      pushOrMerge: (b: { title: string; preview: string }) => st.pushes.push(b),
      banner: null,
      dismiss: () => {},
    }),
  },
}));
vi.mock("@/lib/community-messenger/notifications/messenger-web-desktop-notification", () => ({
  tryShowMessengerWebDesktopNotification: () => {},
}));
vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: () => {},
}));
vi.mock("@/lib/settings/user-settings-store", () => ({ getUserSettings: () => ({}) }));
vi.mock("@/lib/community-messenger/unread/messenger-room-unread-authority", async (orig) => ({
  ...(await orig<typeof import("@/lib/community-messenger/unread/messenger-room-unread-authority")>()),
  peekMessengerRoomUnreadFact: () => st.fact,
}));

import { applyCmParticipantUnreadFullEffects } from "@/lib/community-messenger/notifications/cm-participant-unread-full-effects";

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const DIRECT_ROOM = {
  id: ROOM,
  roomType: "direct",
  title: "q테스트1",
  avatarUrl: null,
  unreadCount: 7,
  lastMessage: "hello",
};
const incoming = {
  id: "m1",
  roomId: ROOM,
  senderId: "peer",
  senderLabel: "q테스트1",
  messageType: "text",
  content: "rf8-2",
  createdAt: new Date().toISOString(),
};

function run(path: string) {
  applyCmParticipantUnreadFullEffects({
    nextRoomId: ROOM,
    nextUnread: 7,
    prevUnread: 6,
    latencyKey: "k",
    viewerUserId: "viewer",
    pathnameRef: { current: path },
    visibilityRef: { current: "visible" },
    surfaceRef: { current: { userNotificationSettings: { community_chat_enabled: true } } as never },
    tRef: { current: ((k: string) => k) as never },
    routerRef: { current: { push: () => {} } as never },
  });
}
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => {
  st.full = null;
  st.critical = null;
  st.snapNow = null;
  st.snapAfterPrefetch = null;
  st.prefetchCalls = 0;
  st.fact = null;
  st.pushes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, messages: [incoming] }) }))
  );
});

describe("앱 안 메시지 배너 — 목록 캐시 없이도 표시", () => {
  it("홈(/philife): 목록 캐시·스냅샷 없음 → 진행 중 방 스냅샷을 기다려 배너 표시 (이전: 0건)", async () => {
    st.snapAfterPrefetch = { room: DIRECT_ROOM, members: [{ id: "peer", label: "q테스트1" }] };
    run("/philife");
    await settle();
    expect(st.prefetchCalls).toBe(1);
    expect(st.pushes).toHaveLength(1);
    expect(st.pushes[0]!.title).toContain("q테스트1");
  });

  it("메신저 목록: critical 목록 캐시만 있음 → 그 행으로 배너 표시, 스냅샷 기다리지 않음", async () => {
    st.critical = {
      tier: "critical",
      me: null,
      chats: [
        {
          room_id: ROOM,
          room_type: "direct",
          direct_key: null,
          title: "q테스트1",
          avatar_url: null,
          avatar_ref: null,
          last_message_preview: "rf8-1",
          last_message_at: new Date().toISOString(),
          unread_count: 7,
          participant_labels_minimal: [],
          group_meta: null,
        },
      ],
      groups: [],
      tabs: { chats: 1, groups: 0 },
    };
    run("/community-messenger");
    await settle();
    expect(st.prefetchCalls).toBe(0);
    expect(st.pushes).toHaveLength(1);
  });

  it("방 정보를 끝내 못 얻으면 배너 없음 (임의 문구로 만들지 않음)", async () => {
    run("/philife");
    await settle();
    expect(st.pushes).toHaveLength(0);
  });

  it("목록 행이 이미 읽음(0)이면 배너 없음 (기존 규칙 유지)", async () => {
    st.full = { chats: [{ ...DIRECT_ROOM, unreadCount: 0 }], groups: [] };
    run("/community-messenger");
    await settle();
    expect(st.pushes).toHaveLength(0);
  });

  it("앱 재실행 직후 홈: 이전 세션에 저장된 목록(안 읽음 0)이 남아 있어도, 방금 받은 최신 안 읽음(1)으로 판단해 배너 표시 (2026-10-31 §9-1)", async () => {
    st.critical = {
      tier: "critical",
      me: null,
      chats: [
        {
          room_id: ROOM,
          room_type: "direct",
          direct_key: null,
          title: "q테스트1",
          avatar_url: null,
          avatar_ref: null,
          last_message_preview: "old",
          last_message_at: new Date(Date.now() - 3_600_000).toISOString(),
          unread_count: 0,
          participant_labels_minimal: [],
          group_meta: null,
        },
      ],
      groups: [],
      tabs: { chats: 1, groups: 0 },
    };
    st.fact = { roomId: ROOM, unreadCount: 1, lastMessageAt: new Date().toISOString(), versionMs: Date.now() };
    run("/philife");
    await settle();
    expect(st.pushes).toHaveLength(1);
  });

  it("최신 안 읽음이 0(내용 기다리는 사이 읽음)이면 배너 없음", async () => {
    st.full = { chats: [DIRECT_ROOM], groups: [] };
    st.fact = { roomId: ROOM, unreadCount: 0, lastMessageAt: new Date().toISOString(), versionMs: Date.now() };
    run("/philife");
    await settle();
    expect(st.pushes).toHaveLength(0);
  });
});

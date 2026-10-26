import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/** 1단계 결함 D-7 S1 (2026-10-26): 통화 기록 bump 때 참가자 목록·배지 캐시 무효화(일반 메시지와 동일). 일반 메시지 bump 는 그대로. */

const calls = { hub: [] as string[], home: [] as string[], cm: [] as string[], full: [] as string[] };

vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({ invalidateOwnerHubBadgeCache: (u: string) => calls.hub.push(u) }));
vi.mock("@/lib/community-messenger/home-sync-snapshot-cache", () => ({ invalidateHomeSyncSnapshotCache: (u: string) => calls.home.push(u) }));
vi.mock("@/lib/community-messenger/cm-bootstrap-snapshot-cache", () => ({ invalidateCmBootstrapSnapshotCache: (u: string) => calls.cm.push(u) }));
vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-cache", () => ({ invalidateFullBootstrapSnapshotCache: (u: string) => calls.full.push(u) }));
vi.mock("@/lib/community-messenger/room-bootstrap-snapshot-cache", () => ({ invalidateRoomBootstrapSnapshotCache: vi.fn() }));
vi.mock("@/lib/community-messenger/server/room-bootstrap-route-cache", () => ({ invalidateRoomBootstrapRouteCacheForRoom: vi.fn() }));
vi.mock("@/lib/community-messenger/realtime/room-bump-broadcast-server", () => ({ publishCommunityMessengerRoomBumpFromServer: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/notification-target-messenger-bridge", () => ({ bumpMessengerRoomTargetsForRecipients: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/engine/adapters/legacy-target-bump-adapter", () => ({ runLegacyTargetBumpNotificationEngineAdapter: vi.fn(async () => {}) }));

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const W = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const Q = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (t: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => (t === "community_messenger_participants" ? Promise.resolve({ data: [{ user_id: W }, { user_id: Q }] }) : chain);
      chain.maybeSingle = () => Promise.resolve({ data: { room_type: "direct", direct_key: `${Q}:${W}` } });
      return chain;
    },
  }),
}));

const msg = (messageType: CommunityMessengerMessage["messageType"]): CommunityMessengerMessage =>
  ({ id: "11111111-1111-4111-8111-111111111111", roomId: ROOM, senderId: W, senderLabel: "", messageType, content: "음성 통화 · 11s", createdAt: "2026-10-26T01:17:08Z", isMine: false }) as CommunityMessengerMessage;

describe("D-7 S1 통화 기록 bump 목록 캐시 무효화", () => {
  beforeEach(() => {
    calls.hub.length = calls.home.length = calls.cm.length = calls.full.length = 0;
  });

  it("call_stub: 두 참가자 모두 목록·배지·cm·full 무효화", async () => {
    const { publishMessengerRoomBumpAfterMutation } = await import("@/lib/community-messenger/server/publish-messenger-room-bump");
    await publishMessengerRoomBumpAfterMutation({ rawRouteRoomId: ROOM, canonicalRoomId: ROOM, fromUserId: W, messageId: "m", messageForBump: msg("call_stub") });
    expect(calls.home.sort()).toEqual([Q, W].sort());
    expect(calls.hub.sort()).toEqual([Q, W].sort());
    expect(calls.cm.sort()).toEqual([Q, W].sort());
    expect(calls.full.sort()).toEqual([Q, W].sort());
  });

  it("일반 text bump: 이 함수에서는 추가 무효화 없음(기존과 동일 — 전송 경로가 따로 무효화)", async () => {
    const { publishMessengerRoomBumpAfterMutation } = await import("@/lib/community-messenger/server/publish-messenger-room-bump");
    await publishMessengerRoomBumpAfterMutation({ rawRouteRoomId: ROOM, canonicalRoomId: ROOM, fromUserId: W, messageId: "m", messageForBump: msg("text") });
    expect(calls.home).toEqual([]);
    expect(calls.hub).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2 — 서버 전송 경로: 차단 게이트 오류 우선순위(B3 · I6), 텍스트 방 bump 빠른 경로·폴백(B1/B2),
 * 음성 영구 삭제 bump 신호(Owner 2026-11-18 추가), 전송 RPC 마이그레이션 앵커.
 */

const fetchBlockedPairFromSb = vi.fn();
const fetchFriendRequestRejectedByPeer = vi.fn();
vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: (...a: unknown[]) => fetchBlockedPairFromSb(...a),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({
  fetchFriendRequestRejectedByPeer: (...a: unknown[]) => fetchFriendRequestRejectedByPeer(...a),
}));
vi.mock("@/lib/community-messenger/server/community-direct-social-block-gate", () => ({
  shouldApplyCommunityDirectSocialBlockGate: () => true,
}));

const publishCommunityMessengerRoomBumpFromServer = vi.fn();
vi.mock("@/lib/community-messenger/realtime/room-bump-broadcast-server", () => ({
  publishCommunityMessengerRoomBumpFromServer: (...a: unknown[]) => publishCommunityMessengerRoomBumpFromServer(...a),
}));
const publishMessengerRoomBumpAfterMutation = vi.fn();
vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: (...a: unknown[]) => publishMessengerRoomBumpAfterMutation(...a),
}));
const invalidateRoomBootstrapSnapshotCache = vi.fn();
vi.mock("@/lib/community-messenger/room-bootstrap-snapshot-cache", () => ({
  invalidateRoomBootstrapSnapshotCache: (...a: unknown[]) => invalidateRoomBootstrapSnapshotCache(...a),
}));
vi.mock("@/lib/community-messenger/server/room-bootstrap-route-cache", () => ({
  invalidateRoomBootstrapRouteCacheForRoom: vi.fn(),
}));
const participantRows: Array<Record<string, unknown>> = [];
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: participantRows, error: null });
      return chain;
    },
  }),
}));

function directRoomSb() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => ({
        data: table === "community_messenger_rooms" ? { room_type: "direct", direct_key: "a:b", chat_domain: "general_direct" } : null,
        error: null,
      });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [{ user_id: "a", left_at: null }, { user_id: "b", left_at: null }], error: null });
      return chain;
    },
  };
}

describe("direct-room-communication-gate — parallel reads keep error priority (I6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocked + rejected both true → blocked_target (block evaluated first)", async () => {
    fetchBlockedPairFromSb.mockResolvedValue({ blockedEitherWay: true });
    fetchFriendRequestRejectedByPeer.mockResolvedValue(true);
    const { assertDirectRoomCommunicationNotBlocked } = await import("@/lib/community-messenger/direct-room-communication-gate");
    const r = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "a", roomId: "r1", supabase: directRoomSb() as never });
    expect(r).toMatchObject({ ok: false, error: "blocked_target", peerUserId: "b" });
    /** 거절 조회는 차단 조회와 동시에 시작된다(1왕복) */
    expect(fetchFriendRequestRejectedByPeer).toHaveBeenCalled();
  });

  it("only rejected → rejected_by_peer; neither → ok", async () => {
    fetchBlockedPairFromSb.mockResolvedValue({ blockedEitherWay: false });
    fetchFriendRequestRejectedByPeer.mockResolvedValue(true);
    const { assertDirectRoomCommunicationNotBlocked } = await import("@/lib/community-messenger/direct-room-communication-gate");
    expect(
      await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "a", roomId: "r1", supabase: directRoomSb() as never })
    ).toMatchObject({ ok: false, error: "rejected_by_peer" });
    fetchFriendRequestRejectedByPeer.mockResolvedValue(false);
    expect(
      await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "a", roomId: "r1", supabase: directRoomSb() as never })
    ).toMatchObject({ ok: true, peerUserId: "b" });
  });
});

describe("publishTextSendRoomBump", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    participantRows.length = 0;
  });
  const msg = {
    id: "11111111-1111-4111-8111-111111111111",
    roomId: "r1",
    senderId: "a",
    senderLabel: "A",
    messageType: "text",
    content: "hi",
    createdAt: "2026-11-18T00:00:00Z",
  } as never;

  it("falls back to publishMessengerRoomBumpAfterMutation (skipBadgeTargetBump) when RPC fields are missing", async () => {
    const { publishTextSendRoomBump } = await import("@/lib/community-messenger/server/publish-text-send-room-bump");
    const r = await publishTextSendRoomBump({
      rawRouteRoomId: "r1",
      canonicalRoomId: "r1",
      fromUserId: "a",
      messageId: "m1",
      messageForBump: msg,
      prefetched: { roomType: null, chatDomain: null, domainIdentity: null, recipientUserIds: ["b"] },
    });
    expect(r).toBe("fallback");
    expect(publishMessengerRoomBumpAfterMutation).toHaveBeenCalledWith(expect.objectContaining({ skipBadgeTargetBump: true }));
    expect(publishCommunityMessengerRoomBumpFromServer).not.toHaveBeenCalled();
  });

  it("fast path publishes with domain fields and snapshot, no room re-read", async () => {
    const { publishTextSendRoomBump } = await import("@/lib/community-messenger/server/publish-text-send-room-bump");
    const r = await publishTextSendRoomBump({
      rawRouteRoomId: "r1",
      canonicalRoomId: "r1",
      fromUserId: "a",
      messageId: "m1",
      messageForBump: msg,
      prefetched: { roomType: "direct", chatDomain: "general_direct", domainIdentity: "general_direct:a:b", recipientUserIds: ["b"] },
    });
    expect(r).toBe("fast");
    expect(publishMessengerRoomBumpAfterMutation).not.toHaveBeenCalled();
    expect(invalidateRoomBootstrapSnapshotCache).toHaveBeenCalledWith("r1", ["a", "b"]);
    const arg = publishCommunityMessengerRoomBumpFromServer.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({ channelRoomId: "r1", chatDomain: "general_direct", domainIdentity: "general_direct:a:b" });
    expect(arg.messageSnapshot).toBeTruthy();
  });

  it("reply + recipient with cleared_at → snapshot dropped (S-2 H)", async () => {
    participantRows.push({ user_id: "a", cleared_at: null }, { user_id: "b", cleared_at: "2026-11-01T00:00:00Z" });
    const { publishTextSendRoomBump } = await import("@/lib/community-messenger/server/publish-text-send-room-bump");
    await publishTextSendRoomBump({
      rawRouteRoomId: "r1",
      canonicalRoomId: "r1",
      fromUserId: "a",
      messageId: "m1",
      messageForBump: { ...(msg as object), replyToMessageId: "22222222-2222-4222-8222-222222222222" } as never,
      prefetched: { roomType: "direct", chatDomain: "general_direct", domainIdentity: "x", recipientUserIds: ["b"] },
    });
    const arg = publishCommunityMessengerRoomBumpFromServer.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.messageSnapshot).toBeNull();
  });
});

describe("voice hard delete → bump with messageAction (Owner 2026-11-18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    participantRows.length = 0;
  });

  it("publishes hard_deleted signal with distinct eventIdentity and invalidates caches", async () => {
    participantRows.push({ user_id: "a" }, { user_id: "b" });
    const { publishMessageHardDeletedRoomBump } = await import(
      "@/lib/community-messenger/server/publish-message-hard-deleted-room-bump"
    );
    await publishMessageHardDeletedRoomBump({ rawRouteRoomId: "r1", canonicalRoomId: "r1", fromUserId: "a", messageId: "m9" });
    expect(invalidateRoomBootstrapSnapshotCache).toHaveBeenCalledWith("r1", ["a", "b"]);
    expect(publishCommunityMessengerRoomBumpFromServer).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "m9", messageAction: "hard_deleted", eventIdentity: "hard_deleted:m9" })
    );
  });

  it("DELETE route publishes after success; receiver removes row without GET", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/messages/[messageId]/route.ts"),
      "utf8"
    );
    expect(route).toContain("publishMessageHardDeletedRoomBump");
    const recv = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"),
      "utf8"
    );
    const block = recv.slice(recv.indexOf('messageAction === "hard_deleted"'), recv.indexOf("const from = typeof payload.fromUserId"));
    expect(block).toContain("prev.filter(");
    expect(block).toContain("return;");
    expect(block).not.toContain("catchUpAfterRemoteBump");
    /** 신호 처리가 dedupe·단건 GET 판단보다 먼저 */
    expect(recv.indexOf('messageAction === "hard_deleted"')).toBeLessThan(recv.indexOf("resolveRoomBumpDedupeKey(payload)"));
  });

  it("server publisher adds optional messageAction only when given (old payload unchanged)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/realtime/room-bump-broadcast-server.ts"), "utf8");
    expect(src).toContain('if (args.messageAction === "hard_deleted") {');
  });
});

describe("migration 20271118120000 — anchors match the repo definition exactly 3 times", () => {
  const def = readFileSync(
    join(process.cwd(), "supabase/migrations/20270414160000_wp6_chat07_unread_exclude_banned.sql"),
    "utf8"
  );
  const fnStart = def.indexOf("CREATE OR REPLACE FUNCTION public.community_messenger_send_text_message");
  const fnEnd = def.indexOf("CREATE OR REPLACE FUNCTION", fnStart + 10);
  const body = def.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
  const count = (s: string, n: string) => s.split(n).length - 1;

  it("return anchor ×3 and direct recipient anchor ×3", () => {
    expect(count(body, "'room_direct_key', to_jsonb(v_room.direct_key)")).toBe(3);
    expect(count(body, "WHERE room_id = p_room_id AND user_id <> p_sender_id;")).toBe(3);
  });

  it("migration file aborts on mismatch and never touches the group branch", () => {
    const mig = readFileSync(
      join(process.cwd(), "supabase/migrations/20271118120000_cm_send_text_return_room_fields_and_active_recipients.sql"),
      "utf8"
    );
    expect(mig).toContain("RAISE EXCEPTION 'P2 return anchor not found exactly 3 times");
    expect(mig).toContain("RAISE EXCEPTION 'P2 recipient anchor not found exactly 3 times");
    expect(mig).toContain("''domain_identity'', to_jsonb(v_room.domain_identity)");
    expect(mig).toContain("AND left_at IS NULL;");
  });
});

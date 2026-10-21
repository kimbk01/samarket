import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 감사 docs/dibay-messenger-full-audit-2026-10-21.md B-1 — D1 송신 gate · UI/라우트 계약 · F-14 서버 발행.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

let roomRow: Record<string, unknown> | null = null;

vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: vi.fn(async () => ({ blockedByMe: true, blockedByPeer: false, blockedEitherWay: true })),
}));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: roomRow, error: null })),
        })),
      })),
    })),
  })),
}));

const publishMock = vi.fn(async (_args: unknown) => ({ ok: true, status: 202, error: "" }));
vi.mock("@/lib/community-messenger/realtime/private-broadcast-server", () => ({
  publishMessengerPrivateBroadcastFromServer: (args: unknown) => publishMock(args),
}));

beforeEach(() => {
  roomRow = null;
  publishMock.mockClear();
});

describe("F-2 / D1 — user block applies to general 1:1 only (send gate)", () => {
  it.each([
    ["trade", true],
    ["store_order", true],
    ["general_direct", false],
    [null, false],
  ])("chat_domain=%s → exempt=%s", async (chatDomain, exempt) => {
    const { assertDirectRoomCommunicationNotBlocked } = await import(
      "@/lib/community-messenger/direct-room-communication-gate"
    );
    roomRow = { room_type: "direct", direct_key: "peer-a:peer-b", chat_domain: chatDomain };
    const res = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "peer-a", roomId: "room-1" });
    expect(res.ok).toBe(exempt);
  });

  it("isUserBlockExemptChatDomain uses chat_domain SSOT only", async () => {
    const { isUserBlockExemptChatDomain } = await import("@/lib/chat-domain/user-block-gate-scope");
    expect(isUserBlockExemptChatDomain("trade")).toBe(true);
    expect(isUserBlockExemptChatDomain("store_order")).toBe(true);
    expect(isUserBlockExemptChatDomain("general_direct")).toBe(false);
    expect(isUserBlockExemptChatDomain("group")).toBe(false);
    expect(isUserBlockExemptChatDomain(null)).toBe(false);
    expect(isUserBlockExemptChatDomain("trade_pc:x")).toBe(false);
  });

  it("send guard keeps every other guard; only the block step is domain-scoped", () => {
    const src = read("lib/community-messenger/server/assert-messenger-room-send-allowed.ts");
    for (const code of ["room_deleted", "room_blocked", "room_archived", "room_readonly", "trade_flow_not_chatting", "store_order_chat_closed"]) {
      expect(src).toContain(`"${code}"`);
    }
    expect(src).toContain("assertDirectRoomCommunicationNotBlocked");
    const gate = read("lib/community-messenger/direct-room-communication-gate.ts");
    expect(gate).toContain("isUserBlockExemptChatDomain(chatDomain)");
  });

  it("room menu block is hidden for trade / store_order rooms", async () => {
    const { communityMessengerRoomAllowsPeerBlockMenu } = await import("@/lib/community-messenger/messenger-room-domain");
    const base = { id: "r", roomType: "direct" } as any;
    expect(communityMessengerRoomAllowsPeerBlockMenu({ ...base, chatDomain: "general_direct" })).toBe(true);
    expect(communityMessengerRoomAllowsPeerBlockMenu({ ...base, chatDomain: "trade" })).toBe(false);
    expect(communityMessengerRoomAllowsPeerBlockMenu({ ...base, chatDomain: "store_order" })).toBe(false);
    expect(communityMessengerRoomAllowsPeerBlockMenu({ ...base, roomType: "private_group" })).toBe(false);
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("communityMessengerRoomAllowsPeerBlockMenu(roomActionSheet.item.room)");
  });
});

describe("F-1 — unblock routes rely on unblockUserSocial (no duplicate restore)", () => {
  it.each([
    "app/api/community-messenger/relations/block/route.ts",
    "app/api/community/block-relations/route.ts",
    "app/api/me/relations/[type]/route.ts",
    "app/api/chat/rooms/[roomId]/unblock/route.ts",
  ])("%s does not call restoreDirectRoomsOnUnblockForViewer itself", (path) => {
    const src = read(path);
    expect(src).toContain("unblockUserSocial(");
    expect(src).not.toContain("restoreDirectRoomsOnUnblockForViewer");
  });
});

describe("F-3 — service cleanup is owner-direction only", () => {
  it("cleanupCommunityMessengerFriendGraphOnBlock / removeCommunityMessengerFriend have no bidirectional deletes", () => {
    const src = read("lib/community-messenger/service.ts");
    const removeStart = src.indexOf("export async function removeCommunityMessengerFriend(");
    const cleanupStart = src.indexOf("export async function cleanupCommunityMessengerFriendGraphOnBlock(");
    const cleanupEnd = src.indexOf("async function verifyUserIsProductChatCounterpart(", cleanupStart);
    const body = src.slice(removeStart, cleanupEnd);
    expect(body).not.toMatch(/and\(user_id\.eq\.\$\{target\}/);
    expect(body).not.toMatch(/and\(user_id\.eq\.\$\{b\}/);
    expect(body).not.toContain("[b, a]");
    expect(body).not.toContain("dev.hiddenFriends.get(b)");
    expect(body).not.toContain("dev.favoriteFriends.get(target)");
  });
});

describe("F-6 — every friend add path uses the same profile gate", () => {
  it.each([
    "app/api/community-messenger/relations/friend/route.ts",
    "app/api/community-messenger/friend-requests/route.ts",
  ])("%s", (path) => {
    const src = read(path);
    expect(src).toContain("@/lib/community-messenger/friendship/friend-add-profile-gate.server");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.indexOf("riendAddProfile(auth.userId)")).toBeGreaterThan(-1);
    expect(post.indexOf("riendAddProfile(auth.userId)")).toBeLessThan(post.indexOf("addCommunityMessengerFriendContact("));
  });
});

describe("F-5 — room dot menu friend add has an in-flight guard", () => {
  it("uses the shared inflight client and a ref guard", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx");
    expect(src).toContain("friendAddInFlightRef.current) return;");
    expect(src).toContain("postCommunityMessengerFriendRequestApi(peerUserId)");
  });
});

describe("F-7 — block confirm is unified on MessengerBlockPeerConfirmModal", () => {
  it("home profile sheet + room action sheet go through the confirm modal", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("<MessengerBlockPeerConfirmModal");
    expect(home).toContain("() => requestToggleBlockWithConfirm(friendProfileForSheet.id)");
    expect(home).toContain('requestToggleBlockWithConfirm(pid, { blockSource: "chat_room" })');
    expect(home).not.toContain("() => void toggleBlock(friendProfileForSheet.id)");
  });

  it("incoming call banner block opens the confirm modal first", () => {
    const src = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(src).toContain("<MessengerBlockPeerConfirmModal");
    expect(src).toContain("onBlock={() => setBlockConfirmSession(bannerSession)}");
    expect(src).not.toContain("onBlock={() => void blockIncomingCall(bannerSession)}");
  });
});

describe("F-8 — failures are surfaced with mapped (non-raw) messages", () => {
  it("home hide toggle reports failure + success", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    const start = home.indexOf("const toggleHiddenFriend = useCallback(");
    const body = home.slice(start, home.indexOf("const toggleBlock = useCallback(", start));
    expect(body).toContain('showMessengerSnackbar(getMessengerActionErrorMessage(json.error), { variant: "error" })');
    expect(body).toContain("cm_social_hide_friend_success");
  });

  it("PeerNotice block, incoming banner block and in-room block never show json.error directly", () => {
    const notice = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx");
    expect(notice).toContain("messengerHomeActionErrorMessage(t, json.error)");
    const incoming = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(incoming).toContain("messengerHomeActionErrorMessage(t, json.error)");
    const controller = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    const fn = controller.slice(controller.indexOf("const blockPeerFromMessage = useCallback("));
    expect(fn.slice(0, 1500)).not.toContain("showMessengerSnackbar(json.error");
  });
});

describe("F-10 — home meta resubscribe also refreshes the social graph", () => {
  it("onStatus resubscribe branch calls onSocialGraphChangedRef", () => {
    const src = read("lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts");
    const meta = src.slice(src.indexOf("name: `community-messenger-home:meta:"), src.indexOf("build: (channel) =>"));
    expect(meta).toContain("refreshScheduler.schedule(); // resubscribe → catch-up");
    expect(meta).toContain("args.onSocialGraphChangedRef?.current?.();");
  });
});

describe("F-11 — list routes answer 5xx instead of an empty list", () => {
  it("friends + hidden routes map MessengerSocialGraphReadError to 503", () => {
    const friends = read("app/api/community-messenger/friends/route.ts");
    expect(friends).toContain("isMessengerSocialGraphReadError(error)");
    expect(friends).toContain("status: 503");
    const me = read("app/api/me/relations/[type]/route.ts");
    expect(me).toContain("isMessengerSocialGraphReadError(error)");
  });
});

describe("F-13 — comments match behaviour; dead request/cooldown client code removed", () => {
  it("social-relations header no longer claims mutual approval", () => {
    const header = read("lib/community-messenger/social-relations.ts").slice(0, 400);
    expect(header).not.toContain("mutual friend");
    expect(header).toContain("단방향");
  });

  it("send guard comment no longer claims the RPC has the same guard", () => {
    const src = read("lib/community-messenger/server/assert-messenger-room-send-allowed.ts");
    expect(src).not.toContain("DB RPC(text/append)도 동일 가드를 갖지만");
  });

  it("dead friend-request client exports are gone", () => {
    const src = read("lib/community-messenger/community-messenger-friend-request-client.ts");
    for (const dead of [
      "formatFriendRejectCooldownShort",
      "messengerFriendRequestBusyId",
      "shouldDisableMessengerOutgoingFriendCancelButton",
      "parseOptimisticOutgoingFriendRequestId",
      "postCancelOutgoingCommunityMessengerFriendRequestApi",
    ]) {
      expect(src).not.toContain(dead);
    }
  });
});

describe("F-14 — hide/unhide reaches other devices via a server-published user broadcast", () => {
  it("publishes cm_home_list_social_graph_changed on the private cm-home-list:<uid> topic", async () => {
    const { publishHomeListSocialGraphChangedToUserBestEffort } = await import(
      "@/lib/community-messenger/realtime/home-list-room-insert-broadcast-server"
    );
    await publishHomeListSocialGraphChangedToUserBestEffort({ userId: "User-1", reason: "friend_hidden" });
    expect(publishMock).toHaveBeenCalledTimes(1);
    const args = publishMock.mock.calls[0]![0] as { messages: Array<{ topic: string; event: string; payload: { reason: string } }> };
    expect(args.messages[0]!.topic).toBe("cm-home-list:user-1");
    expect(args.messages[0]!.event).toBe("cm_home_list_social_graph_changed");
    expect(args.messages[0]!.payload.reason).toBe("friend_hidden");
  });

  it("publish failure never throws into the mutation", async () => {
    const { publishHomeListSocialGraphChangedToUserBestEffort } = await import(
      "@/lib/community-messenger/realtime/home-list-room-insert-broadcast-server"
    );
    publishMock.mockRejectedValueOnce(new Error("down"));
    await expect(
      publishHomeListSocialGraphChangedToUserBestEffort({ userId: "u", reason: "friend_unhidden" })
    ).resolves.toBeUndefined();
  });

  it("hide routes publish server-side; client only listens (no client publish)", () => {
    const hidden = read("app/api/community-messenger/friends/[friendUserId]/hidden/route.ts");
    expect(hidden).toContain("publishHomeListSocialGraphChangedToUserBestEffort");
    const me = read("app/api/me/relations/[type]/route.ts");
    expect(me).toContain('publishHomeListSocialGraphChangedToUserBestEffort({ userId: auth.userId, reason: "friend_unhidden" })');
    const client = read("lib/community-messenger/realtime/home-list-room-insert-broadcast-client.ts");
    expect(client).toContain("CM_HOME_LIST_SOCIAL_GRAPH_CHANGED_EVENT");
    expect(client).toContain('type: "cm.home.social_sync"');
    expect(client).not.toContain("private-broadcast-server");
    expect(client).not.toMatch(/\.send\(/);
  });
});

/**
 * LOCK contract — Telegram-style unilateral Contact + domain isolation.
 * docs/community-messenger/friend-contact-ssot-lock.md
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function readRepo(...parts: string[]): Promise<string> {
  return readFile(path.join(process.cwd(), ...parts), "utf8");
}

describe("friend-contact-ssot-lock", () => {
  it("send/add friend path uses addFriendSaved / addCommunityMessengerFriendContact only", async () => {
    const src = await readRepo("lib/community-messenger/service.ts");
    expect(src).toContain("export async function addCommunityMessengerFriendContact");
    const sendBodyStart = src.indexOf("export async function sendCommunityMessengerFriendRequest");
    expect(sendBodyStart).toBeGreaterThan(0);
    const slice = src.slice(sendBodyStart, sendBodyStart + 1200);
    expect(slice).toContain("addCommunityMessengerFriendContact");
    expect(slice).not.toContain("insertPendingFriendshipRequest");
  });

  it("respond/cancel friend-request writers are retired stubs", async () => {
    const src = await readRepo("lib/community-messenger/service.ts");
    expect(src).toContain('error: "friend_request_retired"');
    expect(src).not.toMatch(
      /export async function respondCommunityMessengerFriendRequest[\s\S]{0,400}applyFriendshipRequestAction/
    );
  });

  it("friend-request respond/cancel routes return 410", async () => {
    const respond = await readRepo("app/api/community-messenger/friend-requests/[requestId]/route.ts");
    const cancel = await readRepo("app/api/community-messenger/friend-requests/cancel-outgoing/route.ts");
    const incoming = await readRepo(
      "app/api/community-messenger/friend-requests/respond-incoming/route.ts"
    );
    expect(respond).toContain("friend_request_retired");
    expect(respond).toContain("410");
    expect(cancel).toContain("410");
    expect(incoming).toContain("410");
  });

  it("friend list projection forbids friendships accepted fallback", async () => {
    const src = await readRepo("lib/community-messenger/friendship/resolve-friendship-pair.ts");
    expect(src).toContain("listContactFriendPeersForViewer");
    const listStart = src.indexOf("export async function listContactFriendPeersForViewer");
    const listBody = src.slice(listStart, listStart + 1800);
    expect(listBody).toContain('relation_type", "friend"');
    expect(listBody).not.toContain("listFriendshipSsotRowsForViewer");
    expect(listBody).not.toContain('status === "accepted"');
  });

  it("block cleanup does not delete peer→blocker friend row", async () => {
    const src = await readRepo("lib/community-messenger/service.ts");
    const start = src.indexOf("export async function cleanupCommunityMessengerFriendGraphOnBlock");
    const friendDeleteSlice = src.slice(start, start + 900);
    expect(friendDeleteSlice).toContain("Telegram unilateral");
    expect(friendDeleteSlice).toContain('eq("owner_user_id", a)');
    expect(friendDeleteSlice).toContain('eq("target_user_id", b)');
    expect(friendDeleteSlice).not.toContain("for (const [owner, target] of");
  });

  it("share friends and GET /friends use FromSsot reader", async () => {
    const share = await readRepo("lib/community/share/list-community-share-targets.ts");
    const route = await readRepo("app/api/community-messenger/friends/route.ts");
    expect(share).toContain("listCommunityMessengerFriendsFromSsot");
    expect(share).not.toMatch(/listCommunityMessengerFriends\s*\(/);
    expect(route).toContain("listCommunityMessengerFriendsFromSsot");
  });

  it("home realtime subscribes user_social_relations for contact sync", async () => {
    const src = await readRepo(
      "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts"
    );
    expect(src).toContain('table: "user_social_relations"');
    expect(src).not.toContain('table: "community_messenger_friendships"');
    expect(src).not.toContain('table: "community_friend_requests"');
  });

  it("trade and store-order services do not import addFriendSaved", async () => {
    const tradeStart = await readRepo("lib/trade/item-trade-chat-start-core.ts").catch(() => "");
    const storeOrder = await readRepo("lib/community-messenger/store-order-chat-service.ts");
    expect(tradeStart).not.toContain("addFriendSaved");
    expect(tradeStart).not.toContain("addCommunityMessengerFriendContact");
    expect(storeOrder).not.toContain("addFriendSaved");
    expect(storeOrder).not.toContain("addCommunityMessengerFriendContact");
  });

  it("group-room-service does not write friend relations", async () => {
    const src = await readRepo("lib/community-messenger/group/group-room-service.ts");
    expect(src).not.toContain("addFriendSaved");
    expect(src).not.toContain("user_social_relations");
  });

  it("friends_only call privacy uses calleeSavedCaller direction", async () => {
    const src = await readRepo("lib/community-messenger/direct-call-permission.ts");
    expect(src).toContain("calleeSavedCaller");
    expect(src).toContain("savedByPeer");
  });

  it("pending friendship writers are removed from friendships-ssot module", async () => {
    const src = await readRepo("lib/community-messenger/friendship/community-messenger-friendships-ssot.ts");
    expect(src).not.toContain("insertPendingFriendshipRequest");
    expect(src).not.toContain("applyFriendshipRequestAction");
    expect(src).not.toContain("resetFriendshipToPending");
    expect(src).not.toContain("findPendingIncomingFriendshipRow");
  });

  it("friend request notify writer module is deleted", async () => {
    const fs = await import("node:fs/promises");
    await expect(
      fs.access(path.join(process.cwd(), "lib/notifications/community-messenger-friend-inapp-notify.ts"))
    ).rejects.toBeTruthy();
  });
});

/**
 * LOCK contract — mutual friend request + Contact SSOT isolation.
 * docs/community-messenger/friend-contact-ssot-lock.md
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function readRepo(...parts: string[]): Promise<string> {
  return readFile(path.join(process.cwd(), ...parts), "utf8");
}

describe("friend-contact-ssot-lock", () => {
  it("send friend path uses cm_send_friend_request RPC (pending only)", async () => {
    const src = await readRepo("lib/community-messenger/service.ts");
    const sendBodyStart = src.indexOf("export async function sendCommunityMessengerFriendRequest");
    expect(sendBodyStart).toBeGreaterThan(0);
    const slice = src.slice(sendBodyStart, sendBodyStart + 1800);
    expect(slice).toContain("rpcCmSendFriendRequest");
    expect(slice).not.toContain("addCommunityMessengerFriendContact");
    expect(slice).not.toContain("addFriendSaved");
  });

  it("respond/cancel friend-request writers call atomic accept/reject RPCs", async () => {
    const src = await readRepo("lib/community-messenger/service.ts");
    const respondStart = src.indexOf("export async function respondCommunityMessengerFriendRequest");
    expect(respondStart).toBeGreaterThan(0);
    const slice = src.slice(respondStart, respondStart + 2200);
    expect(slice).toContain("rpcCmAcceptFriendRequest");
    expect(slice).toContain("rpcCmRejectFriendRequest");
    expect(slice).not.toContain('error: "friend_request_retired"');
  });

  it("friend-request routes are live (not 410 retired)", async () => {
    const list = await readRepo("app/api/community-messenger/friend-requests/route.ts");
    const respond = await readRepo("app/api/community-messenger/friend-requests/[requestId]/route.ts");
    const cancel = await readRepo("app/api/community-messenger/friend-requests/cancel-outgoing/route.ts");
    const incoming = await readRepo(
      "app/api/community-messenger/friend-requests/respond-incoming/route.ts"
    );
    expect(list).toContain("listCommunityMessengerFriendRequests");
    expect(list).toContain("sendCommunityMessengerFriendRequest");
    expect(respond).toContain("respondCommunityMessengerFriendRequest");
    expect(respond).not.toContain("410");
    expect(cancel).toContain("cancelOutgoingCommunityMessengerFriendRequestByAddressee");
    expect(cancel).not.toContain("410");
    expect(incoming).toContain("respondIncomingCommunityMessengerFriendRequestByRequester");
    expect(incoming).not.toContain("410");
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

  it("MessagingGlobalChrome mounts GlobalIncomingFriendRequestHost (center popup)", async () => {
    const src = await readRepo("components/layout/providers/MessagingGlobalChrome.tsx");
    expect(src).toContain("GlobalIncomingFriendRequestHost");
    expect(src).toContain("shouldIdleDeferGlobalIncomingFriendRequestHost");
  });

  it("home realtime subscribes community_friend_requests for request sync", async () => {
    const src = await readRepo(
      "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts"
    );
    expect(src).toContain('table: "user_social_relations"');
    expect(src).toContain('table: "community_friend_requests"');
    expect(src).not.toContain('table: "community_messenger_friendships"');
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

  it("accept migration is a single atomic function with both friend upserts", async () => {
    const sql = await readRepo(
      "supabase/migrations/20261201120000_cm_mutual_friend_request_atomic.sql"
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cm_accept_friend_request");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("INSERT INTO public.user_social_relations");
    expect(sql).toContain("v_req.requester_id, v_req.addressee_id");
    expect(sql).toContain("v_req.addressee_id, v_req.requester_id");
    expect(sql).toContain("SET status = 'accepted'");
    expect(sql).toContain("RAISE;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.cm_accept_friend_request(uuid, uuid) FROM anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cm_accept_friend_request(uuid, uuid) TO service_role");
  });
});

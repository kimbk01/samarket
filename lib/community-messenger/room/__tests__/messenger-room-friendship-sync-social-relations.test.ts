import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSocialRelationRowForRoomSync } from "@/lib/community-messenger/room/messenger-room-friendship-sync";

const VIEWER = "aaaaaaaa-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PEER = "cccccccc-dddd-4ddd-8ddd-dddddddddddd";
const OTHER = "eeeeeeee-ffff-4fff-8fff-ffffffffffff";

describe("F-9 user_social_relations row → room refresh", () => {
  it("refreshes when the viewer's row targets the peer (friend/blocked/delete)", () => {
    for (const relation_type of ["friend", "blocked"]) {
      expect(
        parseSocialRelationRowForRoomSync({ owner_user_id: VIEWER, target_user_id: PEER, relation_type }, VIEWER, PEER)
      ).toEqual({ shouldRefresh: true, optimisticAccepted: false });
    }
    /** DELETE old record without owner (replica identity) but with target */
    expect(parseSocialRelationRowForRoomSync({ target_user_id: PEER }, VIEWER, PEER).shouldRefresh).toBe(true);
  });

  it("ignores rows for another target or another owner", () => {
    expect(
      parseSocialRelationRowForRoomSync({ owner_user_id: VIEWER, target_user_id: OTHER }, VIEWER, PEER).shouldRefresh
    ).toBe(false);
    expect(
      parseSocialRelationRowForRoomSync({ owner_user_id: OTHER, target_user_id: PEER }, VIEWER, PEER).shouldRefresh
    ).toBe(false);
    expect(parseSocialRelationRowForRoomSync({ id: "x" }, VIEWER, PEER).shouldRefresh).toBe(false);
  });

  it("never optimistic-accepts (one-way save is not mutual friendship)", () => {
    expect(
      parseSocialRelationRowForRoomSync({ owner_user_id: VIEWER, target_user_id: PEER, relation_type: "friend" }, VIEWER, PEER)
        .optimisticAccepted
    ).toBe(false);
  });
});

describe("P-2·F-9 hook source contract", () => {
  const src = readFileSync(join(process.cwd(), "lib/community-messenger/room/use-messenger-room-friendship-sync.ts"), "utf8");

  it("subscribes user_social_relations with owner filter, not the dead legacy table", () => {
    expect(src).toContain('table: "user_social_relations"');
    expect(src).toContain("filter: `owner_user_id=eq.${viewerId}`");
    expect(src).not.toContain("community_messenger_friendships");
  });

  it("effect deps are primitives only; refresh/setSnapshot via refs", () => {
    const deps = src.match(/\}, \[peerUserId, rid, roomReadyForRealtime, roomType, shouldRun, viewerId\]\);/);
    expect(deps).not.toBeNull();
    expect(src).not.toMatch(/snapshot\?\.room,\s*\n/);
    expect(src).toContain("refreshRef.current(true");
    expect(src).toContain("setSnapshotRef.current(");
  });

  it("same-topic resubscribe waits for removal (M-5)", () => {
    expect(src).toContain("runAfterCmRtTopicRemoval(channelName");
    expect(src).toContain("removeCmRtChannelTracked(sb, channel, channelName)");
  });
});

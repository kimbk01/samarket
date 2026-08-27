import { describe, expect, it } from "vitest";
import {
  listGiftTransferEligibleFriends,
  type GiftTransferEligibleFriendsDeps,
} from "@/lib/gift-certificate/list-gift-transfer-eligible-friends";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

const VIEWER = "viewer";
const FRIEND_C = "friend-c";

function friend(id: string, overrides: Partial<CommunityMessengerProfileLite> = {}): CommunityMessengerProfileLite {
  return {
    id,
    label: id,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
    ...overrides,
  };
}

function deps(args: {
  friends: CommunityMessengerProfileLite[];
  blockedIds?: string[];
  statuses?: Record<string, { status?: string | null; deleted_at?: string | null }>;
}): GiftTransferEligibleFriendsDeps {
  return {
    listFriends: async () => args.friends,
    fetchBlockedIds: async () => new Set(args.blockedIds ?? []),
    fetchProfileStatuses: async (ids) =>
      new Map(
        ids.map((id) => [
          id,
          { id, status: args.statuses?.[id]?.status ?? "verified_user", deleted_at: args.statuses?.[id]?.deleted_at ?? null },
        ])
      ),
  };
}

describe("listGiftTransferEligibleFriends", () => {
  it("T1 returns canonical friend C for the picker", async () => {
    const rows = await listGiftTransferEligibleFriends(
      VIEWER,
      deps({ friends: [friend(FRIEND_C)] })
    );

    expect(rows.map((row) => row.id)).toEqual([FRIEND_C]);
  });

  it("T2 excludes self", async () => {
    const rows = await listGiftTransferEligibleFriends(
      VIEWER,
      deps({ friends: [friend(VIEWER), friend(FRIEND_C)] })
    );

    expect(rows.map((row) => row.id)).toEqual([FRIEND_C]);
  });

  it("T3 excludes non-friend rows if the source ever includes them", async () => {
    const rows = await listGiftTransferEligibleFriends(
      VIEWER,
      deps({ friends: [friend("non-friend", { isFriend: false }), friend(FRIEND_C)] })
    );

    expect(rows.map((row) => row.id)).toEqual([FRIEND_C]);
  });

  it("T4 excludes hidden, blocked, and restricted recipients", async () => {
    const rows = await listGiftTransferEligibleFriends(
      VIEWER,
      deps({
        friends: [
          friend("hidden", { isHiddenFriend: true }),
          friend("blocked-by-row", { blocked: true }),
          friend("blocked-by-ssot"),
          friend("suspended"),
          friend("deleted"),
          friend(FRIEND_C),
        ],
        blockedIds: ["blocked-by-ssot"],
        statuses: {
          suspended: { status: "suspended" },
          deleted: { status: "verified_user", deleted_at: "2026-01-01T00:00:00.000Z" },
        },
      })
    );

    expect(rows.map((row) => row.id)).toEqual([FRIEND_C]);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

const VIEWER = "11111111-1111-1111-1111-111111111111";
const PEER_A = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const PEER_B = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-06-30T12:00:00.000Z");

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/community-messenger/friendship/community-messenger-friendships-ssot", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/community-messenger/friendship/community-messenger-friendships-ssot")
  >();
  return {
    ...actual,
    listFriendshipSsotRowsForViewer: vi.fn(),
  };
});

vi.mock("@/lib/community-messenger/social-relations", () => ({
  listHiddenUserRelationshipRows: vi.fn(async () => []),
}));

vi.mock("@/lib/community-messenger/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/service")>();
  return {
    ...actual,
    hydrateProfilesLabelsOnlyWithMap: vi.fn(),
    buildProfilesFromKnownRelations: vi.fn(),
  };
});

import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listFriendshipSsotRowsForViewer } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import { listHiddenUserRelationshipRows } from "@/lib/community-messenger/social-relations";
import {
  buildProfilesFromKnownRelations,
  hydrateProfilesLabelsOnlyWithMap,
} from "@/lib/community-messenger/service";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";

function ssotRow(partial: Partial<FriendshipSsotRow> & Pick<FriendshipSsotRow, "status">): FriendshipSsotRow {
  return {
    id: partial.id ?? "row-1",
    requester_user_id: partial.requester_user_id ?? VIEWER,
    addressee_user_id: partial.addressee_user_id ?? PEER_A,
    created_at: partial.created_at ?? "2026-06-30T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-06-30T00:00:00.000Z",
    ...partial,
  };
}

function mockSbForFavorites(favoriteIds: string[] = []) {
  return {
    from: vi.fn((table: string) => {
      if (table === "community_friend_favorites") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: favoriteIds.map((id) => ({ target_user_id: id })),
                error: null,
              })),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  };
}

describe("listCommunityMessengerFriendsFromSsot — Gate B", () => {
  beforeEach(() => {
    vi.mocked(tryCreateSupabaseServiceClient).mockReset();
    vi.mocked(listFriendshipSsotRowsForViewer).mockReset();
    vi.mocked(listHiddenUserRelationshipRows).mockReset();
    vi.mocked(hydrateProfilesLabelsOnlyWithMap).mockReset();
    vi.mocked(buildProfilesFromKnownRelations).mockReset();
    vi.mocked(listHiddenUserRelationshipRows).mockResolvedValue([]);
    vi.mocked(tryCreateSupabaseServiceClient).mockReturnValue(mockSbForFavorites() as any);
  });

  it("includes SSOT accepted peers only and maps accepted_at", async () => {
    vi.mocked(listFriendshipSsotRowsForViewer).mockResolvedValue([
      ssotRow({
        id: "a1",
        status: "accepted",
        accepted_at: "2026-06-30T10:00:00.000Z",
        requester_user_id: VIEWER,
        addressee_user_id: PEER_A,
      }),
      ssotRow({
        id: "p1",
        status: "pending",
        requester_user_id: PEER_B,
        addressee_user_id: VIEWER,
      }),
      ssotRow({
        id: "c1",
        status: "accepted",
        readd_blocked_until: "2026-07-01T00:00:00.000Z",
        requester_user_id: VIEWER,
        addressee_user_id: PEER_B,
      }),
    ]);

    const profileMap = new Map([
      [
        PEER_A,
        {
          id: PEER_A,
          display_name: "Peer A",
          nickname: null,
          username: null,
          dibay_id: null,
          avatar_url: null,
          bio: null,
        },
      ],
    ]);
    vi.mocked(hydrateProfilesLabelsOnlyWithMap).mockResolvedValue({
      members: [],
      profileMap: profileMap as any,
    });
    vi.mocked(buildProfilesFromKnownRelations).mockImplementation((params) => [
      {
        id: PEER_A,
        label: "Peer A",
        avatarUrl: null,
        following: false,
        blocked: false,
        isFriend: true,
        isFavoriteFriend: false,
        friendshipAcceptedAt: params.friendshipAcceptedAtByPeer?.get(PEER_A) ?? null,
      },
    ]);

    const friends = await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });

    expect(friends).toHaveLength(1);
    expect(friends[0]?.id).toBe(PEER_A);
    expect(friends[0]?.friendshipAcceptedAt).toBe("2026-06-30T10:00:00.000Z");
    expect(hydrateProfilesLabelsOnlyWithMap).toHaveBeenCalledWith(VIEWER, [PEER_A]);
    expect(buildProfilesFromKnownRelations).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: VIEWER,
        targetIds: [PEER_A],
        friendIds: [PEER_A],
      })
    );
  });

  it("excludes hidden friends from hydrate target ids", async () => {
    vi.mocked(listFriendshipSsotRowsForViewer).mockResolvedValue([
      ssotRow({ id: "a1", status: "accepted", addressee_user_id: PEER_A }),
      ssotRow({ id: "a2", status: "accepted", addressee_user_id: PEER_B }),
    ]);
    vi.mocked(listHiddenUserRelationshipRows).mockResolvedValue([
      { id: "h1", targetUserId: PEER_B, createdAt: "2026-06-30T00:00:00.000Z" },
    ]);
    vi.mocked(hydrateProfilesLabelsOnlyWithMap).mockResolvedValue({
      members: [],
      profileMap: new Map(),
    });
    vi.mocked(buildProfilesFromKnownRelations).mockReturnValue([]);

    await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });

    expect(hydrateProfilesLabelsOnlyWithMap).toHaveBeenCalledWith(VIEWER, [PEER_A]);
  });

  it("does not call legacy merge helpers (spy via ssot list only)", async () => {
    vi.mocked(listFriendshipSsotRowsForViewer).mockResolvedValue([]);
    await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });
    expect(listFriendshipSsotRowsForViewer).toHaveBeenCalledTimes(1);
    expect(hydrateProfilesLabelsOnlyWithMap).not.toHaveBeenCalled();
  });
});

describe("Gate D — home-sync uses SSOT friends list", () => {
  it("getCommunityMessengerHomeSyncBundle imports listCommunityMessengerFriendsFromSsot", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../get-community-messenger-home-sync-bundle.ts", import.meta.url),
        "utf8"
      )
    );
    expect(src).toContain("listCommunityMessengerFriendsFromSsot");
    expect(src).not.toMatch(/listCommunityMessengerFriends\s*\(/);
  });
});

describe("Gate B — friends route uses SSOT list", () => {
  it("route imports listCommunityMessengerFriendsFromSsot", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../../app/api/community-messenger/friends/route.ts", import.meta.url), "utf8")
    );
    expect(src).toContain("listCommunityMessengerFriendsFromSsot");
    expect(src).not.toMatch(/listCommunityMessengerFriends\s*\(/);
  });
});

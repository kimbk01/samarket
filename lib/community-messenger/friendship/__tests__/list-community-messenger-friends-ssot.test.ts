import { describe, expect, it, vi, beforeEach } from "vitest";

const VIEWER = "11111111-1111-1111-1111-111111111111";
const PEER_A = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const PEER_B = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-06-30T12:00:00.000Z");

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/community-messenger/friendship/resolve-friendship-pair", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/community-messenger/friendship/resolve-friendship-pair")
  >();
  return {
    ...actual,
    listContactFriendPeersForViewerResult: vi.fn(),
  };
});

vi.mock("@/lib/community-messenger/social-relations", () => ({
  listHiddenUserRelationshipRowsResult: vi.fn(async () => ({ ok: true as const, rows: [] })),
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
import { listContactFriendPeersForViewerResult } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { listHiddenUserRelationshipRowsResult } from "@/lib/community-messenger/social-relations";
import {
  buildProfilesFromKnownRelations,
  hydrateProfilesLabelsOnlyWithMap,
} from "@/lib/community-messenger/service";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";

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

describe("listCommunityMessengerFriendsFromSsot — Gate B (Contact SSOT)", () => {
  beforeEach(() => {
    vi.mocked(tryCreateSupabaseServiceClient).mockReset();
    vi.mocked(listContactFriendPeersForViewerResult).mockReset();
    vi.mocked(listHiddenUserRelationshipRowsResult).mockReset();
    vi.mocked(hydrateProfilesLabelsOnlyWithMap).mockReset();
    vi.mocked(buildProfilesFromKnownRelations).mockReset();
    vi.mocked(listHiddenUserRelationshipRowsResult).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(tryCreateSupabaseServiceClient).mockReturnValue(mockSbForFavorites() as any);
  });

  it("includes contact peers only and maps savedAt", async () => {
    vi.mocked(listContactFriendPeersForViewerResult).mockResolvedValue({
      ok: true,
      peers: [
        {
          peerUserId: PEER_A,
          savedAt: "2026-06-30T10:00:00.000Z",
          source: "social_relations",
          row: null,
        },
      ],
    });

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

    const result = await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.friends).toHaveLength(1);
    expect(result.friends[0]?.id).toBe(PEER_A);
    expect(result.friends[0]?.friendshipAcceptedAt).toBe("2026-06-30T10:00:00.000Z");
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
    vi.mocked(listContactFriendPeersForViewerResult).mockResolvedValue({
      ok: true,
      peers: [
        { peerUserId: PEER_A, savedAt: null, source: "social_relations", row: null },
        { peerUserId: PEER_B, savedAt: null, source: "social_relations", row: null },
      ],
    });
    vi.mocked(listHiddenUserRelationshipRowsResult).mockResolvedValue({
      ok: true,
      rows: [{ id: "h1", targetUserId: PEER_B, createdAt: "2026-06-30T00:00:00.000Z" }],
    });
    vi.mocked(hydrateProfilesLabelsOnlyWithMap).mockResolvedValue({
      members: [],
      profileMap: new Map(),
    });
    vi.mocked(buildProfilesFromKnownRelations).mockReturnValue([]);

    await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });

    expect(hydrateProfilesLabelsOnlyWithMap).toHaveBeenCalledWith(VIEWER, [PEER_A]);
  });

  it("does not hydrate when contact list empty", async () => {
    vi.mocked(listContactFriendPeersForViewerResult).mockResolvedValue({ ok: true, peers: [] });
    await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });
    expect(listContactFriendPeersForViewerResult).toHaveBeenCalledTimes(1);
    expect(hydrateProfilesLabelsOnlyWithMap).not.toHaveBeenCalled();
  });

  it("F-11: contact DB error returns ok:false (no empty fail-open)", async () => {
    vi.mocked(listContactFriendPeersForViewerResult).mockResolvedValue({
      ok: false,
      error: "connection refused",
    });
    const result = await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("db_error");
    expect(hydrateProfilesLabelsOnlyWithMap).not.toHaveBeenCalled();
  });

  it("F-11: hidden DB error returns ok:false (no empty fail-open)", async () => {
    vi.mocked(listContactFriendPeersForViewerResult).mockResolvedValue({
      ok: true,
      peers: [{ peerUserId: PEER_A, savedAt: null, source: "social_relations", row: null }],
    });
    vi.mocked(listHiddenUserRelationshipRowsResult).mockResolvedValue({
      ok: false,
      error: "hidden_list_failed",
    });
    const result = await listCommunityMessengerFriendsFromSsot(VIEWER, { nowMs: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("db_error");
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

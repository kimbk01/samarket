import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

vi.mock("@/lib/community-messenger/friendship/community-messenger-friendships-ssot", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/community-messenger/friendship/community-messenger-friendships-ssot")
  >();
  return {
    ...actual,
    fetchFriendshipPairRow: vi.fn(),
    listFriendshipSsotRowsForViewer: vi.fn(),
  };
});

import {
  fetchFriendshipPairRow,
  listFriendshipSsotRowsForViewer,
} from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import {
  listAcceptedFriendshipPeersForViewer,
  mapFriendshipDirectionFromSsot,
  mapFriendshipPairStateFromSsotRow,
  peerUserIdFromFriendshipSsotRow,
  resolveFriendshipPair,
} from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { getFriendshipPairState } from "@/lib/community-messenger/friendship-resolver";

const VIEWER = "11111111-1111-1111-1111-111111111111";
const PEER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const NOW = Date.parse("2026-06-30T12:00:00.000Z");

function row(partial: Partial<FriendshipSsotRow> & Pick<FriendshipSsotRow, "status">): FriendshipSsotRow {
  return {
    id: "row-1",
    requester_user_id: VIEWER,
    addressee_user_id: PEER,
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    ...partial,
  };
}

function mockSbSocialAndLegacy({
  mutualFriend = false,
  legacyAccepted = false,
}: {
  mutualFriend?: boolean;
  legacyAccepted?: boolean;
} = {}) {
  const from = vi.fn((table: string) => {
    if (table === "user_social_relations") {
      const chain = {
        eq: vi.fn(function eq(this: unknown, col: string, val: string) {
          if (col === "relation_type") {
            return { maybeSingle: vi.fn().mockResolvedValue({ data: mutualFriend ? { id: "sr-1" } : null, error: null }) };
          }
          return chain;
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: mutualFriend ? { id: "sr-1" } : null, error: null }),
      };
      return { select: vi.fn(() => chain) };
    }
    if (table === "community_friend_requests") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: legacyAccepted ? { id: "legacy-1" } : null,
                  error: null,
                }),
              })),
            })),
          })),
        })),
      };
    }
    return { select: vi.fn() };
  });
  return { from } as any;
}

describe("mapFriendshipPairStateFromSsotRow", () => {
  it("maps accepted, pending, blocked, removed", () => {
    expect(mapFriendshipPairStateFromSsotRow(row({ status: "accepted" }), NOW)).toBe("accepted");
    expect(mapFriendshipPairStateFromSsotRow(row({ status: "pending" }), NOW)).toBe("pending");
    expect(mapFriendshipPairStateFromSsotRow(row({ status: "blocked" }), NOW)).toBe("blocked");
    expect(mapFriendshipPairStateFromSsotRow(row({ status: "removed" }), NOW)).toBe("removed");
  });

  it("maps readd_cooldown when until is in the future", () => {
    expect(
      mapFriendshipPairStateFromSsotRow(
        row({ status: "accepted", readd_blocked_until: "2026-07-01T00:00:00.000Z" }),
        NOW
      )
    ).toBe("readd_cooldown");
  });

  it("uses status when readd_cooldown expired", () => {
    expect(
      mapFriendshipPairStateFromSsotRow(
        row({ status: "accepted", readd_blocked_until: "2026-06-01T00:00:00.000Z" }),
        NOW
      )
    ).toBe("accepted");
  });
});

describe("mapFriendshipDirectionFromSsot", () => {
  it("maps mutual_accepted, outgoing, incoming, none", () => {
    const pendingOut = row({ status: "pending", requester_user_id: VIEWER, addressee_user_id: PEER });
    const pendingIn = row({ status: "pending", requester_user_id: PEER, addressee_user_id: VIEWER });
    expect(mapFriendshipDirectionFromSsot(VIEWER, row({ status: "accepted" }), "accepted")).toBe("mutual_accepted");
    expect(mapFriendshipDirectionFromSsot(VIEWER, pendingOut, "pending")).toBe("outgoing_pending");
    expect(mapFriendshipDirectionFromSsot(VIEWER, pendingIn, "pending")).toBe("incoming_pending");
    expect(mapFriendshipDirectionFromSsot(VIEWER, row({ status: "blocked" }), "blocked")).toBe("none");
    expect(mapFriendshipDirectionFromSsot(VIEWER, null, "none")).toBe("none");
  });
});

describe("peerUserIdFromFriendshipSsotRow", () => {
  it("returns the non-viewer party", () => {
    expect(
      peerUserIdFromFriendshipSsotRow(
        VIEWER,
        row({ status: "accepted", requester_user_id: VIEWER, addressee_user_id: PEER })
      )
    ).toBe(PEER);
  });
});

describe("resolveFriendshipPair", () => {
  beforeEach(() => {
    vi.mocked(fetchFriendshipPairRow).mockReset();
    vi.mocked(listFriendshipSsotRowsForViewer).mockReset();
  });

  it("returns none for empty ids or same user", async () => {
    const r = await resolveFriendshipPair({} as any, "", PEER);
    expect(r.state).toBe("none");
    expect(r.direction).toBe("none");
    expect(r.source).toBe("none");
  });

  it("returns SSOT accepted with mutual_accepted direction", async () => {
    const ssotRow = row({ status: "accepted" });
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(ssotRow);
    const r = await resolveFriendshipPair(mockSbSocialAndLegacy(), VIEWER, PEER, { nowMs: NOW });
    expect(r.state).toBe("accepted");
    expect(r.direction).toBe("mutual_accepted");
    expect(r.source).toBe("friendships_ssot");
    expect(r.row).toBe(ssotRow);
  });

  it("returns SSOT pending incoming direction", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(
      row({ status: "pending", requester_user_id: PEER, addressee_user_id: VIEWER })
    );
    const r = await resolveFriendshipPair(mockSbSocialAndLegacy(), VIEWER, PEER, { nowMs: NOW });
    expect(r.state).toBe("pending");
    expect(r.direction).toBe("incoming_pending");
  });

  it("returns SSOT pending outgoing direction", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(
      row({ status: "pending", requester_user_id: VIEWER, addressee_user_id: PEER })
    );
    const r = await resolveFriendshipPair(mockSbSocialAndLegacy(), VIEWER, PEER, { nowMs: NOW });
    expect(r.direction).toBe("outgoing_pending");
  });

  it("returns SSOT blocked with none direction", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(row({ status: "blocked" }));
    const r = await resolveFriendshipPair(mockSbSocialAndLegacy(), VIEWER, PEER, { nowMs: NOW });
    expect(r.state).toBe("blocked");
    expect(r.direction).toBe("none");
  });

  it("falls back to social_relations accepted when no SSOT row", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(null);
    const r = await resolveFriendshipPair(mockSbSocialAndLegacy({ mutualFriend: true }), VIEWER, PEER, {
      nowMs: NOW,
    });
    expect(r.state).toBe("accepted");
    expect(r.direction).toBe("mutual_accepted");
    expect(r.source).toBe("social_relations");
    expect(r.row).toBeNull();
  });

  it("falls back to legacy_requests accepted when no SSOT row", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(null);
    const r = await resolveFriendshipPair(
      mockSbSocialAndLegacy({ mutualFriend: false, legacyAccepted: true }),
      VIEWER,
      PEER,
      { nowMs: NOW }
    );
    expect(r.state).toBe("accepted");
    expect(r.source).toBe("legacy_requests");
  });
});

describe("listAcceptedFriendshipPeersForViewer", () => {
  beforeEach(() => {
    vi.mocked(listFriendshipSsotRowsForViewer).mockReset();
  });

  it("lists accepted peers only from SSOT rows", async () => {
    vi.mocked(listFriendshipSsotRowsForViewer).mockResolvedValue([
      row({ id: "a1", status: "accepted", requester_user_id: VIEWER, addressee_user_id: PEER }),
      row({ id: "p1", status: "pending", requester_user_id: PEER, addressee_user_id: VIEWER }),
      row({
        id: "c1",
        status: "accepted",
        readd_blocked_until: "2026-07-01T00:00:00.000Z",
        requester_user_id: VIEWER,
        addressee_user_id: "22222222-2222-2222-2222-222222222222",
      }),
    ]);
    const list = await listAcceptedFriendshipPeersForViewer({} as any, VIEWER, { nowMs: NOW });
    expect(list).toHaveLength(1);
    expect(list[0]?.peerUserId).toBe(PEER);
  });
});

describe("getFriendshipPairState delegation", () => {
  beforeEach(() => {
    vi.mocked(fetchFriendshipPairRow).mockReset();
  });

  it("delegates to resolveFriendshipPair", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(row({ status: "accepted" }));
    const resolved = await getFriendshipPairState(mockSbSocialAndLegacy(), VIEWER, PEER, { nowMs: NOW });
    expect(resolved.state).toBe("accepted");
    expect(resolved.source).toBe("friendships_ssot");
  });
});

describe("Gate A — resolver uniqueness contract", () => {
  it("exports resolveFriendshipPair as the pair judgment entry", async () => {
    const mod = await import("@/lib/community-messenger/friendship/resolve-friendship-pair");
    expect(typeof mod.resolveFriendshipPair).toBe("function");
    expect(typeof mod.listAcceptedFriendshipPeersForViewer).toBe("function");
  });
});

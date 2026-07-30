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

import { fetchFriendshipPairRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import {
  listContactFriendPeersForViewer,
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

function mockSbContact({
  viewerSavedPeer = false,
  contactList = [] as Array<{ target_user_id: string; created_at?: string }>,
}: {
  viewerSavedPeer?: boolean;
  contactList?: Array<{ target_user_id: string; created_at?: string }>;
} = {}) {
  const from = vi.fn((table: string) => {
    if (table === "user_social_relations") {
      return {
        select: vi.fn((cols: string) => {
          if (cols.includes("created_at")) {
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: contactList,
                  error: null,
                })),
              })),
            };
          }
          const chain = {
            eq: vi.fn(function eq(this: unknown, col: string, _val: string) {
              if (col === "relation_type") {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: viewerSavedPeer ? { id: "sr-1" } : null,
                    error: null,
                  }),
                };
              }
              return chain;
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: viewerSavedPeer ? { id: "sr-1" } : null,
              error: null,
            }),
          };
          return chain;
        }),
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
});

describe("mapFriendshipDirectionFromSsot — Contact LOCK", () => {
  it("maps accepted to mutual_accepted label; pending unused", () => {
    expect(mapFriendshipDirectionFromSsot(VIEWER, row({ status: "accepted" }), "accepted")).toBe(
      "mutual_accepted"
    );
    expect(mapFriendshipDirectionFromSsot(VIEWER, row({ status: "pending" }), "pending")).toBe("none");
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

describe("resolveFriendshipPair — Contact only", () => {
  beforeEach(() => {
    vi.mocked(fetchFriendshipPairRow).mockReset();
  });

  it("returns none for empty ids or same user", async () => {
    const r = await resolveFriendshipPair({} as any, "", PEER);
    expect(r.state).toBe("none");
    expect(r.source).toBe("none");
  });

  it("returns contact save as accepted", async () => {
    const r = await resolveFriendshipPair(mockSbContact({ viewerSavedPeer: true }), VIEWER, PEER);
    expect(r.state).toBe("accepted");
    expect(r.source).toBe("social_relations");
    expect(fetchFriendshipPairRow).not.toHaveBeenCalled();
  });

  it("ignores friendships SSOT when no contact — returns none", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(row({ status: "accepted" }));
    const r = await resolveFriendshipPair(mockSbContact(), VIEWER, PEER);
    expect(r.state).toBe("none");
    expect(r.source).toBe("none");
  });
});

describe("listContactFriendPeersForViewer", () => {
  it("lists contact saves only", async () => {
    const peers = await listContactFriendPeersForViewer(
      mockSbContact({
        contactList: [{ target_user_id: PEER, created_at: "2026-06-01T00:00:00.000Z" }],
      }),
      VIEWER
    );
    expect(peers).toEqual([
      {
        peerUserId: PEER,
        savedAt: "2026-06-01T00:00:00.000Z",
        source: "social_relations",
        row: null,
      },
    ]);
  });
});

describe("getFriendshipPairState", () => {
  it("delegates to resolveFriendshipPair", async () => {
    const r = await getFriendshipPairState(mockSbContact({ viewerSavedPeer: true }), VIEWER, PEER);
    expect(r.state).toBe("accepted");
    expect(r.source).toBe("social_relations");
  });
});

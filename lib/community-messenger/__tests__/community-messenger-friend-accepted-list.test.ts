import { describe, expect, it } from "vitest";
import {
  mergeCommunityFriendAcceptedRowsFromSources,
  peerIdFromCommunityFriendAcceptedRow,
  unionCommunityFriendAcceptedRowsByPeer,
} from "@/lib/community-messenger/friendship/community-messenger-friend-accepted-list";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import { acceptedPeerIdsFromCommunityFriendRows } from "@/lib/community-messenger/service";

const VIEWER = "user-viewer";
const PEER_A = "user-peer-a";
const PEER_B = "user-peer-b";
const TRADE_PEER = "user-trade-only";

function ssotRow(
  partial: Pick<FriendshipSsotRow, "requester_user_id" | "addressee_user_id" | "status"> &
    Partial<FriendshipSsotRow>
): FriendshipSsotRow {
  return {
    id: partial.id ?? "fr-1",
    requester_user_id: partial.requester_user_id,
    addressee_user_id: partial.addressee_user_id,
    status: partial.status,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00.000Z",
    accepted_at: partial.accepted_at ?? null,
    removed_at: partial.removed_at ?? null,
    blocked_by_user_id: partial.blocked_by_user_id ?? null,
    blocked_at: partial.blocked_at ?? null,
    readd_blocked_until: partial.readd_blocked_until ?? null,
  };
}

function legacyMutualRow(peerId: string) {
  return {
    requester_id: VIEWER,
    addressee_id: peerId,
    status: "accepted" as const,
    responded_at: "2026-01-02T00:00:00.000Z",
  };
}

function peerIdsFromMerge(input: Parameters<typeof mergeCommunityFriendAcceptedRowsFromSources>[0]) {
  const rows = mergeCommunityFriendAcceptedRowsFromSources(input);
  return acceptedPeerIdsFromCommunityFriendRows(VIEWER, rows);
}

describe("mergeCommunityFriendAcceptedRowsFromSources — Phase 2-1 SSOT", () => {
  it("1) friendships accepted + no legacy mutual save → friend list peer", () => {
    expect(
      peerIdsFromMerge({
        userId: VIEWER,
        ssotRows: [
          ssotRow({
            requester_user_id: VIEWER,
            addressee_user_id: PEER_A,
            status: "accepted",
            accepted_at: "2026-06-01T00:00:00.000Z",
          }),
        ],
        legacyMutualRows: [],
        legacyRequestRows: [],
      })
    ).toEqual([PEER_A]);
  });

  it("2) legacy mutual save + no friendships accepted → fallback peer", () => {
    expect(
      peerIdsFromMerge({
        userId: VIEWER,
        ssotRows: [],
        legacyMutualRows: [legacyMutualRow(PEER_B)],
        legacyRequestRows: [],
      })
    ).toEqual([PEER_B]);
  });

  it("3) friendships pending → not in friend list (legacy mutual suppressed)", () => {
    expect(
      peerIdsFromMerge({
        userId: VIEWER,
        ssotRows: [
          ssotRow({
            requester_user_id: PEER_A,
            addressee_user_id: VIEWER,
            status: "pending",
          }),
        ],
        legacyMutualRows: [legacyMutualRow(PEER_A)],
        legacyRequestRows: [],
      })
    ).toEqual([]);
  });

  it("4) friendships blocked/removed → not in friend list", () => {
    for (const status of ["blocked", "removed"] as const) {
      expect(
        peerIdsFromMerge({
          userId: VIEWER,
          ssotRows: [
            ssotRow({
              requester_user_id: VIEWER,
              addressee_user_id: PEER_A,
              status,
            }),
          ],
          legacyMutualRows: [legacyMutualRow(PEER_A)],
          legacyRequestRows: [],
        })
      ).toEqual([]);
    }
  });

  it("5) trade/store_order counterpart only (no friendship row, no legacy) → empty", () => {
    expect(
      peerIdsFromMerge({
        userId: VIEWER,
        ssotRows: [],
        legacyMutualRows: [],
        legacyRequestRows: [],
      })
    ).toEqual([]);
    expect(peerIdFromCommunityFriendAcceptedRow(VIEWER, legacyMutualRow(TRADE_PEER))).toBe(TRADE_PEER);
  });

  it("SSOT accepted wins over duplicate legacy row for same peer", () => {
    const rows = mergeCommunityFriendAcceptedRowsFromSources({
      userId: VIEWER,
      ssotRows: [
        ssotRow({
          requester_user_id: VIEWER,
          addressee_user_id: PEER_A,
          status: "accepted",
          accepted_at: "2026-06-01T00:00:00.000Z",
        }),
      ],
      legacyMutualRows: [legacyMutualRow(PEER_A)],
      legacyRequestRows: [],
    });
    expect(rows).toHaveLength(1);
    expect(peerIdFromCommunityFriendAcceptedRow(VIEWER, rows[0]!)).toBe(PEER_A);
    expect(rows[0]?.responded_at).toBe("2026-06-01T00:00:00.000Z");
  });

  it("unionCommunityFriendAcceptedRowsByPeer dedupes by peer", () => {
    const rows = unionCommunityFriendAcceptedRowsByPeer(
      VIEWER,
      [{ requester_id: VIEWER, addressee_id: PEER_A, status: "accepted" }],
      [{ requester_id: PEER_A, addressee_id: VIEWER, status: "accepted", responded_at: "2026-06-02T00:00:00.000Z" }]
    );
    expect(rows).toHaveLength(1);
    expect(peerIdFromCommunityFriendAcceptedRow(VIEWER, rows[0]!)).toBe(PEER_A);
  });
});

describe("acceptedPeerIdsFromCommunityFriendRows export sanity", () => {
  it("maps accepted rows to peer ids", () => {
    expect(
      acceptedPeerIdsFromCommunityFriendRows(VIEWER, [
        { requester_id: VIEWER, addressee_id: PEER_A, status: "accepted" },
      ])
    ).toEqual([PEER_A]);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

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
    listContactFriendPeersForViewer: vi.fn(),
  };
});

vi.mock("@/lib/community-messenger/social-relations", () => ({
  listHiddenUserRelationshipRows: vi.fn(async () => []),
}));

import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listContactFriendPeersForViewer } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { listHiddenUserRelationshipRows } from "@/lib/community-messenger/social-relations";
import {
  listBootstrapAcceptedFriendRowsFromSsot,
  listSsotAcceptedPeerIdsForViewer,
} from "@/lib/community-messenger/friendship/bootstrap-accepted-friend-rows-from-ssot";

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

describe("listBootstrapAcceptedFriendRowsFromSsot — Step 4", () => {
  beforeEach(() => {
    vi.mocked(tryCreateSupabaseServiceClient).mockReturnValue({} as any);
    vi.mocked(listHiddenUserRelationshipRows).mockResolvedValue([]);
    vi.mocked(listContactFriendPeersForViewer).mockReset();
  });

  it("maps SSOT accepted rows only", async () => {
    vi.mocked(listContactFriendPeersForViewer).mockResolvedValue([
      {
        peerUserId: PEER_A,
        savedAt: "2026-06-30T10:00:00.000Z",
        source: "friendships_ssot",
        row: ssotRow({
          id: "a1",
          status: "accepted",
          accepted_at: "2026-06-30T10:00:00.000Z",
        }),
      },
    ]);

    const rows = await listBootstrapAcceptedFriendRowsFromSsot(VIEWER, { nowMs: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requester_id).toBe(VIEWER);
    expect(rows[0]?.addressee_id).toBe(PEER_A);
    expect(rows[0]?.status).toBe("accepted");
    expect(rows[0]?.responded_at).toBe("2026-06-30T10:00:00.000Z");
  });

  it("maps contact-only saves without SSOT row", async () => {
    vi.mocked(listContactFriendPeersForViewer).mockResolvedValue([
      {
        peerUserId: PEER_B,
        savedAt: "2026-06-29T00:00:00.000Z",
        source: "social_relations",
        row: null,
      },
    ]);
    const rows = await listBootstrapAcceptedFriendRowsFromSsot(VIEWER, { nowMs: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requester_id).toBe(VIEWER);
    expect(rows[0]?.addressee_id).toBe(PEER_B);
  });

  it("excludes hidden peers (same as GET /api/friends)", async () => {
    vi.mocked(listContactFriendPeersForViewer).mockResolvedValue([
      {
        peerUserId: PEER_A,
        savedAt: null,
        source: "friendships_ssot",
        row: ssotRow({ id: "a1", status: "accepted", addressee_user_id: PEER_A }),
      },
      {
        peerUserId: PEER_B,
        savedAt: null,
        source: "friendships_ssot",
        row: ssotRow({ id: "a2", status: "accepted", addressee_user_id: PEER_B }),
      },
    ]);
    vi.mocked(listHiddenUserRelationshipRows).mockResolvedValue([
      { id: "h1", targetUserId: PEER_B, createdAt: "2026-06-30T00:00:00.000Z" },
    ]);

    const peerIds = await listSsotAcceptedPeerIdsForViewer(VIEWER, { nowMs: NOW });
    expect(peerIds).toEqual([PEER_A]);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const peekBootstrapLiteSocialDeferred = vi.fn();
const fetchBootstrapLiteSocialGraphSnapshot = vi.fn();

vi.mock("@/lib/community-messenger/bootstrap-lite-social-deferred-cache", () => ({
  peekBootstrapLiteSocialDeferred,
}));
vi.mock("@/lib/community-messenger/service", () => ({
  fetchBootstrapLiteSocialGraphSnapshot,
}));

describe("resolveBootstrapAcceptedFriendRows", () => {
  const viewer = "bbbbbbbb-2222-2222-2222-222222222222";
  const peerA = "aaaaaaaa-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    peekBootstrapLiteSocialDeferred.mockReturnValue({ snapshot: null, source: "empty", peekMs: 0 });
    fetchBootstrapLiteSocialGraphSnapshot.mockResolvedValue({
      acceptedFriendRows: [],
      favoriteFriendIds: [],
      followingIds: [],
      hiddenIds: [],
      blockedIds: [],
      requestRows: [],
    });
  });

  it("returns rpc rows when live SSOT has no extra peers", async () => {
    const rpc = [
      {
        requester_id: viewer,
        addressee_id: "cccccccc-3333-3333-3333-333333333333",
        status: "accepted",
      },
    ];
    fetchBootstrapLiteSocialGraphSnapshot.mockResolvedValue({
      acceptedFriendRows: rpc,
      favoriteFriendIds: [],
      followingIds: [],
      hiddenIds: [],
      blockedIds: [],
      requestRows: [],
    });

    const { resolveBootstrapAcceptedFriendRows } = await import(
      "@/lib/community-messenger/friendship/resolve-bootstrap-accepted-friend-rows"
    );
    const rows = await resolveBootstrapAcceptedFriendRows(viewer, rpc);
    expect(rows).toEqual(rpc);
    expect(fetchBootstrapLiteSocialGraphSnapshot).toHaveBeenCalledTimes(1);
  });

  it("overlays primed deferred cache over stale rpc rows", async () => {
    const rpc: never[] = [];
    const primed = [
      {
        requester_id: peerA,
        addressee_id: viewer,
        status: "accepted",
        responded_at: "2026-06-30T00:00:00.000Z",
      },
    ];
    peekBootstrapLiteSocialDeferred.mockReturnValue({
      snapshot: { acceptedFriendRows: primed },
      source: "cache",
      peekMs: 1,
    });

    const { resolveBootstrapAcceptedFriendRows } = await import(
      "@/lib/community-messenger/friendship/resolve-bootstrap-accepted-friend-rows"
    );
    const rows = await resolveBootstrapAcceptedFriendRows(viewer, rpc);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requester_id).toBe(peerA);
    expect(fetchBootstrapLiteSocialGraphSnapshot).not.toHaveBeenCalled();
  });

  it("merges live SSOT peers missing from rpc snapshot", async () => {
    const rpc = [
      {
        requester_id: viewer,
        addressee_id: "cccccccc-3333-3333-3333-333333333333",
        status: "accepted",
      },
    ];
    fetchBootstrapLiteSocialGraphSnapshot.mockResolvedValue({
      acceptedFriendRows: [
        ...rpc,
        {
          requester_id: peerA,
          addressee_id: viewer,
          status: "accepted",
          responded_at: "2026-06-30T00:00:00.000Z",
        },
      ],
      favoriteFriendIds: [],
      followingIds: [],
      hiddenIds: [],
      blockedIds: [],
      requestRows: [],
    });

    const { resolveBootstrapAcceptedFriendRows } = await import(
      "@/lib/community-messenger/friendship/resolve-bootstrap-accepted-friend-rows"
    );
    const rows = await resolveBootstrapAcceptedFriendRows(viewer, rpc);
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.requester_id === peerA)).toBe(true);
  });
});

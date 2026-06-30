import { describe, expect, it, vi, beforeEach } from "vitest";

const invalidateHomeSyncSnapshotCache = vi.fn();
const invalidateCmBootstrapSnapshotCache = vi.fn();
const invalidateFullBootstrapSnapshotCache = vi.fn();
const invalidateBootstrapLiteSocialDeferred = vi.fn();
const storeBootstrapLiteSocialDeferred = vi.fn();
const fetchBootstrapLiteSocialGraphSnapshot = vi.fn();

vi.mock("@/lib/community-messenger/home-sync-snapshot-cache", () => ({
  invalidateHomeSyncSnapshotCache,
}));
vi.mock("@/lib/community-messenger/cm-bootstrap-snapshot-cache", () => ({
  invalidateCmBootstrapSnapshotCache,
}));
vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-cache", () => ({
  invalidateFullBootstrapSnapshotCache,
}));
vi.mock("@/lib/community-messenger/bootstrap-lite-social-deferred-cache", () => ({
  invalidateBootstrapLiteSocialDeferred,
  storeBootstrapLiteSocialDeferred,
}));
vi.mock("@/lib/community-messenger/service", () => ({
  fetchBootstrapLiteSocialGraphSnapshot,
}));

describe("primeMessengerFriendshipSocialGraphAfterAccept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBootstrapLiteSocialGraphSnapshot.mockResolvedValue({
      acceptedFriendRows: [
        {
          requester_id: "aaaaaaaa-1111-1111-1111-111111111111",
          addressee_id: "bbbbbbbb-2222-2222-2222-222222222222",
          status: "accepted",
        },
      ],
      favoriteFriendIds: [],
      followingIds: [],
      hiddenIds: [],
      blockedIds: [],
      requestRows: [],
    });
  });

  it("invalidates snapshot caches and primes lite social deferred for both users", async () => {
    const { primeMessengerFriendshipSocialGraphAfterAccept } = await import(
      "@/lib/community-messenger/friendship/prime-messenger-friendship-social-graph-after-accept"
    );
    const requester = "aaaaaaaa-1111-1111-1111-111111111111";
    const addressee = "bbbbbbbb-2222-2222-2222-222222222222";

    await primeMessengerFriendshipSocialGraphAfterAccept([requester, addressee]);

    expect(invalidateHomeSyncSnapshotCache).toHaveBeenCalledWith(requester);
    expect(invalidateHomeSyncSnapshotCache).toHaveBeenCalledWith(addressee);
    expect(invalidateCmBootstrapSnapshotCache).toHaveBeenCalledWith(requester);
    expect(invalidateCmBootstrapSnapshotCache).toHaveBeenCalledWith(addressee);
    expect(invalidateFullBootstrapSnapshotCache).toHaveBeenCalledWith(requester, "friend_accept");
    expect(invalidateFullBootstrapSnapshotCache).toHaveBeenCalledWith(addressee, "friend_accept");
    expect(invalidateBootstrapLiteSocialDeferred).toHaveBeenCalledWith(requester);
    expect(invalidateBootstrapLiteSocialDeferred).toHaveBeenCalledWith(addressee);
    expect(fetchBootstrapLiteSocialGraphSnapshot).toHaveBeenCalledTimes(2);
    expect(storeBootstrapLiteSocialDeferred).toHaveBeenCalledTimes(2);
  });
});

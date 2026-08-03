/**
 * P3-b2 LOCK — Auth Epoch Reset Authority contract.
 *
 * Logout / account switch must:
 * - clear Badge + Projection memory (no prior-user generation/inflight/roomFacts)
 * - NOT call badge-count?fresh=1
 * - discard stale in-flight responses from the prior epoch
 *
 * Excluded: poll / participant / resume / reconnect / Builder / P0~P3-b1 semantics.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

const scheduleStartupApiDeferred = vi.fn((_id: string, run: () => void) => {
  run();
  return () => {};
});
vi.mock("@/lib/http/startup-api-scheduler", () => ({
  scheduleStartupApiDeferred: (...args: unknown[]) =>
    scheduleStartupApiDeferred(...(args as [string, () => void])),
}));

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const domainPayload = {
  ok: true,
  authority: "domain_badge",
  projectionVersionMs: 500,
  domainUnreadRooms: { general_direct: 3, group: 1, trade: 0, store_order: 0 },
  domainAppIcon: { messenger: 4, trade: 0, storeOrder: 0, missedCall: 0 },
  nonChatEventAttention: {
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminNotice: 0,
  },
  notificationAttentionTotal: 4,
  total: 4,
  chatMessage: 3,
  groupMessage: 1,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 3,
  group: 1,
  trade: 0,
  store: 0,
  missedCall: 0,
};

describe("P3-b2 Auth Epoch Reset contract (static)", () => {
  it("sign-out surfaces reset is clear-only (no fresh GET / hub resync)", () => {
    const src = fs.readFileSync(
      path.join(
        ROOT,
        "lib/community-messenger/notifications/messenger-notification-surfaces-reset.ts"
      ),
      "utf8"
    );
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly).toContain("auth_epoch_surface_clear");
    expect(codeOnly).toContain("OWNER_HUB_BADGE_EMPTY");
    expect(codeOnly).toContain("applyHubBadgeProjection");
    expect(codeOnly).not.toMatch(/requestMessengerHubBadgeResync/);
    expect(codeOnly).not.toMatch(/requestNotificationBadgeCountResync/);
    expect(codeOnly).not.toContain("fresh=1");
    expect(codeOnly).not.toContain("auth_signed_out");
  });

  it("wipe resets Badge + Projection before remaining auth caches", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/auth/client-session-wipe.ts"), "utf8");
    expect(src).toContain("resetNotificationBadgeCountForAuthEpoch");
    expect(src).toContain("resetProjectionAuthorityForAuthEpoch");
    expect(src).toContain("resetOwnerHubBadgeStoreForAuthEpoch");
    const resetFn = src.match(
      /function resetAuthClientCaches\([\s\S]*?\n\}\n/
    )?.[0];
    expect(resetFn).toBeTruthy();
    const badgeIdx = resetFn!.indexOf("resetNotificationBadgeCountForAuthEpoch");
    const projIdx = resetFn!.indexOf("resetProjectionAuthorityForAuthEpoch");
    const ownerHubIdx = resetFn!.indexOf("resetOwnerHubBadgeStoreForAuthEpoch");
    const surfacesIdx = resetFn!.indexOf("resetMessengerNotificationSurfacesAfterSignOut");
    const bootIdx = resetFn!.indexOf("invalidateAppBootAll");
    expect(bootIdx).toBeGreaterThanOrEqual(0);
    expect(badgeIdx).toBeGreaterThan(bootIdx);
    expect(projIdx).toBeGreaterThan(badgeIdx);
    expect(ownerHubIdx).toBeGreaterThan(projIdx);
    expect(surfacesIdx).toBeGreaterThan(ownerHubIdx);
  });

  it("production Auth Epoch reset APIs exist", () => {
    const badge = fs.readFileSync(
      path.join(ROOT, "lib/notifications/notification-badge-count-store.ts"),
      "utf8"
    );
    const auth = fs.readFileSync(
      path.join(ROOT, "lib/notifications/projection-authority.ts"),
      "utf8"
    );
    const ownerHub = fs.readFileSync(
      path.join(ROOT, "lib/chats/owner-hub-badge-store.ts"),
      "utf8"
    );
    expect(badge).toContain("export function resetNotificationBadgeCountForAuthEpoch");
    expect(badge).toContain("auth_epoch_stale_discard");
    expect(badge).toContain("authEpochFetchOpen");
    expect(auth).toContain("export function resetProjectionAuthorityForAuthEpoch");
    expect(auth).toContain('reason: "auth_epoch_reset"');
    expect(ownerHub).toContain("export function resetOwnerHubBadgeStoreForAuthEpoch");
    expect(ownerHub).toContain("authEpochAtStart !== ownerHubBadgeAuthEpoch");
  });
});

describe("P3-b2 Auth Epoch Reset runtime", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    scheduleStartupApiDeferred.mockClear();
  });

  it("stale prior-epoch response does not commit after logout", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });

    let resolveFetch!: (v: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    const authority = await import("@/lib/notifications/projection-authority");
    store.resetNotificationBadgeCountStoreForTests();
    authority.resetProjectionAuthorityForTests();

    // Open gate + start A fetch (non-fresh Boot path).
    const pending = store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("fresh=1");
    const epochBefore = store.getNotificationBadgeAuthEpoch();

    // Logout / Auth Epoch reset while A is still in flight.
    store.resetNotificationBadgeCountForAuthEpoch();
    authority.resetProjectionAuthorityForAuthEpoch();
    expect(store.getNotificationBadgeAuthEpoch()).toBe(epochBefore + 1);
    expect(store.getNotificationBadgeCountSnapshot()).toBeNull();
    expect(authority.getProjectionAuthorityState()).toBe("EMPTY");
    expect(authority.getProjectionGenerationLineage()).toBeNull();

    // A response arrives late.
    resolveFetch({
      status: 200,
      json: async () => domainPayload,
    });
    await pending;
    await flush();

    expect(store.getNotificationBadgeCountSnapshot()).toBeNull();
    expect(authority.getProjectionAuthorityState()).toBe("EMPTY");
    expect(authority.getProjectionMetadata()?.projectionGeneration ?? 0).toBe(0);
    expect(authority.listProjectionAuthorityRoomFacts()).toHaveLength(0);
  });

  it("Auth Epoch reset then Boot yields COMPLETE generation=1 for next user", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        ...domainPayload,
        projectionVersionMs: 900,
        domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
        notificationAttentionTotal: 1,
        total: 1,
        chatMessage: 1,
        groupMessage: 0,
        chat: 1,
        group: 0,
        domainAppIcon: { messenger: 1, trade: 0, storeOrder: 0, missedCall: 0 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    const authority = await import("@/lib/notifications/projection-authority");
    store.resetNotificationBadgeCountStoreForTests();
    authority.resetProjectionAuthorityForTests();

    // Simulate prior user COMPLETE.
    await store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    expect(authority.getProjectionAuthorityState()).toBe("COMPLETE");
    expect(authority.getProjectionMetadata()?.projectionGeneration).toBe(1);
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(1);

    // Logout.
    store.resetNotificationBadgeCountForAuthEpoch();
    authority.resetProjectionAuthorityForAuthEpoch();
    expect(store.getNotificationBadgeCountSnapshot()).toBeNull();
    expect(authority.getProjectionAuthorityState()).toBe("EMPTY");
    expect(authority.listProjectionAuthorityRoomFacts()).toHaveLength(0);

    // Next user Boot (gate re-opens inside ensureInitialBadgeSnapshotForBoot).
    fetchMock.mockClear();
    await store.ensureInitialBadgeSnapshotForBoot(2);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("fresh=1");
    expect(authority.getProjectionAuthorityState()).toBe("COMPLETE");
    expect(authority.getProjectionMetadata()?.projectionGeneration).toBe(1);
    expect(authority.listProjectionAuthorityRoomFacts().every((r) => r.unread === 0 || r.unread >= 0)).toBe(
      true
    );
  });

  it("reset closes fetch gate so Bell deferred cannot fire network during wipe", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => domainPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    store.resetNotificationBadgeCountForAuthEpoch();
    fetchMock.mockClear();

    store.requestNotificationBadgeCountResync("should_be_blocked");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * P3-c2 — unconditional 45s poll → dirty-gated single-flight fallback.
 *
 * CONTRACT:
 *   COMPLETE + clean + visible + auth open → poll tick HTTP 0
 *   dirty → poll fallback HTTP ≤ 1 (joins inflight)
 *   apply ok → dirty clear; fail → dirty keep; sync recursive retry 0
 *   Auth Epoch reset → clearInterval; stale epoch callback commit 0
 *
 * EXCLUDED: visibility/resume/reconnect redesign, RT health coordinator,
 * server projectionVersionMs stabilization, P0~P3-c1 semantics.
 */

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const scheduleStartupApiDeferred = vi.fn((_id: string, run: () => void) => {
  run();
  return () => {};
});
vi.mock("@/lib/http/startup-api-scheduler", () => ({
  scheduleStartupApiDeferred: (...args: unknown[]) =>
    scheduleStartupApiDeferred(...(args as [string, () => void])),
}));

const domainPayload = {
  ok: true,
  authority: "domain_badge",
  projectionVersionMs: 100,
  domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
  domainAppIcon: { messenger: 1, trade: 0, storeOrder: 0, missedCall: 0 },
  nonChatEventAttention: {
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminNotice: 0,
  },
  notificationAttentionTotal: 1,
  total: 1,
  chatMessage: 1,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 1,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("P3-c2 static contract", () => {
  it("poll tick is dirty-gated; no unconditional doFetch on interval", () => {
    const src = read("lib/notifications/notification-badge-count-store.ts");
    const code = stripComments(src);
    expect(code).toContain("BADGE_COUNT_POLL_DIRTY_REASON");
    expect(code).toContain("poll_tick_skipped");
    expect(code).toContain('reason: "clean"');
    expect(code).toContain("poll_dirty_fallback");
    // Unconditional visible→doFetch() must not remain.
    expect(code).not.toMatch(
      /setInterval\(\(\)\s*=>\s*\{\s*if\s*\(document\.visibilityState\s*===\s*"visible"\)\s*void\s*doFetch\(\)/
    );
    expect(code).toContain("tickBadgeCountPoll");
  });

  it("Auth Epoch reset clears poll interval (P3-c2 residual resource)", () => {
    const src = read("lib/notifications/notification-badge-count-store.ts");
    const code = stripComments(src);
    const resetStart = code.indexOf("export function resetNotificationBadgeCountForAuthEpoch");
    expect(resetStart).toBeGreaterThan(-1);
    const resetBody = code.slice(resetStart, resetStart + 1200);
    expect(resetBody).toContain("clearPollInterval");
    expect(resetBody).toContain("pollDirty = false");
  });

  it("does not invent RT health coordinator or version stabilization", () => {
    const src = read("lib/notifications/notification-badge-count-store.ts");
    expect(src).not.toMatch(/realtimeHealth|rtHealthCoordinator|projectionVersionMs\s*=\s*Date\.now/);
  });
});

describe("P3-c2 runtime dirty poll", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    scheduleStartupApiDeferred.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("COMPLETE + clean → poll tick HTTP 0", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => domainPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    const unsub = store.subscribeNotificationBadgeCount(() => {});
    await store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(1);
    expect(store.getNotificationBadgePollDirtyStateForTests().pollDirty).toBe(false);
    fetchMock.mockClear();

    store.__tickNotificationBadgePollForTests();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(0);
    unsub();
  });

  it("dirty → poll fallback HTTP 1 then clear; next clean tick 0", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        ...domainPayload,
        projectionVersionMs: 200,
        notificationAttentionTotal: 2,
        total: 2,
        chatMessage: 2,
        chat: 2,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    const unsub = store.subscribeNotificationBadgeCount(() => {});
    await store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    fetchMock.mockClear();

    store.markNotificationBadgePollDirty("unit_explicit_dirty");
    expect(store.getNotificationBadgePollDirtyStateForTests().pollDirty).toBe(true);

    store.__tickNotificationBadgePollForTests();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("fresh=1");
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/me/notifications/badge-count");
    expect(store.getNotificationBadgePollDirtyStateForTests().pollDirty).toBe(false);

    fetchMock.mockClear();
    store.__tickNotificationBadgePollForTests();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(0);
    unsub();
  });

  it("fetch fail keeps dirty; same tick does not recursively retry", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => domainPayload,
      })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    const unsub = store.subscribeNotificationBadgeCount(() => {});
    await store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    fetchMock.mockClear();

    store.markNotificationBadgePollDirty("unit_fail");
    store.__tickNotificationBadgePollForTests();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getNotificationBadgePollDirtyStateForTests().pollDirty).toBe(true);
    // No sync recursive second call from the failed Promise chain.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("poll joins inflight (single-flight); Auth Epoch clears interval", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    const unsub = store.subscribeNotificationBadgeCount(() => {});
    const bootP = store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    store.markNotificationBadgePollDirty("during_boot");
    store.__tickNotificationBadgePollForTests();
    await flush();
    // Join — no second HTTP while Boot inflight.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      status: 200,
      json: async () => domainPayload,
    });
    await bootP;
    await flush();
    expect(store.getNotificationBadgePollDirtyStateForTests().hasPollInterval).toBe(true);

    store.resetNotificationBadgeCountForAuthEpoch();
    expect(store.getNotificationBadgePollDirtyStateForTests().hasPollInterval).toBe(false);
    expect(store.getNotificationBadgePollDirtyStateForTests().pollDirty).toBe(false);

    fetchMock.mockClear();
    store.__tickNotificationBadgePollForTests();
    await flush();
    // Gate closed + clean → HTTP 0
    expect(fetchMock).toHaveBeenCalledTimes(0);
    unsub();
  });

  it("hidden visibility → poll tick HTTP 0 even when dirty", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => domainPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    // Boot needs visible? doFetch doesn't check visibility — only poll tick does.
    vi.stubGlobal("document", { visibilityState: "visible" });
    const unsub = store.subscribeNotificationBadgeCount(() => {});
    await store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    fetchMock.mockClear();

    store.markNotificationBadgePollDirty("unit_hidden");
    vi.stubGlobal("document", { visibilityState: "hidden" });
    store.__tickNotificationBadgePollForTests();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(store.getNotificationBadgePollDirtyStateForTests().pollDirty).toBe(true);
    unsub();
  });
});

/**
 * P3-b1 LOCK — Boot Initial Generation Authority contract.
 *
 * Cold COMPLETE owner = App Boot background (`app_boot_initial_badge`), not Bell.
 * Bell subscriber joins `ensureInitialBadgeSnapshotForBoot` (no direct doFetch owner).
 * Fresh/resync and logout reset are out of scope (P3-c / P3-b2).
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
}

const domainPayload = {
  ok: true,
  authority: "domain_badge",
  projectionVersionMs: 200,
  domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
  domainAppIcon: { messenger: 1, trade: 0, storeOrder: 0, missedCall: 0 },
  nonChatEventAttention: {
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminNotice: 0,
  },
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

describe("P3-b1 Boot Initial Generation Authority contract", () => {
  it("App Boot background schedules app-boot-initial-badge via ensureInitialBadgeSnapshotForBoot", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "lib/app-boot/schedule-app-boot-background.ts"),
      "utf8"
    );
    expect(src).toContain("app-boot-initial-badge");
    expect(src).toContain("app_boot_initial_badge");
    expect(src).toContain("ensureInitialBadgeSnapshotForBoot");
    expect(src).toContain("getAppBootSnapshot().profile");
  });

  it("run-app-boot deferred plan lists badge-count for Boot ownership", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/app-boot/run-app-boot.ts"), "utf8");
    expect(src).toContain("/api/me/notifications/badge-count");
  });

  it("Bell subscriber joins Boot entry and does not own doFetch for first paint", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "lib/notifications/notification-badge-count-store.ts"),
      "utf8"
    );
    expect(src).toContain("ensureInitialBadgeSnapshotForBoot");
    expect(src).toContain("APP_BOOT_INITIAL_BADGE_REASON");
    expect(src).toContain("app_boot_initial_badge");
    const subscribeFn = src.match(
      /export function subscribeNotificationBadgeCount\([\s\S]*?\n\}\n\n\/\*\*/
    )?.[0];
    expect(subscribeFn).toBeTruthy();
    expect(subscribeFn!).toContain("ensureInitialBadgeSnapshotForBoot()");
    expect(subscribeFn!).not.toContain("void doFetch(");
  });

  it("P3-b1 does not touch logout wipe / surfaces-reset (P3-b2)", () => {
    const wipe = fs.readFileSync(path.join(ROOT, "lib/auth/client-session-wipe.ts"), "utf8");
    const surfaces = fs.readFileSync(
      path.join(ROOT, "lib/community-messenger/notifications/messenger-notification-surfaces-reset.ts"),
      "utf8"
    );
    expect(wipe).not.toContain("ensureInitialBadgeSnapshotForBoot");
    expect(surfaces).not.toContain("ensureInitialBadgeSnapshotForBoot");
  });
});

describe("ensureInitialBadgeSnapshotForBoot runtime", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    scheduleStartupApiDeferred.mockClear();
  });

  it("Boot+Bell join to a single non-fresh HTTP request", async () => {
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

    const bootP = store.ensureInitialBadgeSnapshotForBoot(7);
    const unsub = store.subscribeNotificationBadgeCount(() => {});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown] | undefined;
    expect(String(firstCall?.[0] ?? "")).not.toContain("fresh=1");

    resolveFetch({
      status: 200,
      json: async () => domainPayload,
    });
    await bootP;
    await flush();
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(1);
    await store.ensureInitialBadgeSnapshotForBoot(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("requestNotificationBadgeCountResync still uses fresh=1 (P3-c untouched)", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => domainPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    await store.ensureInitialBadgeSnapshotForBoot(1);
    await flush();
    fetchMock.mockClear();

    store.requestNotificationBadgeCountResync("unit_fresh_unchanged");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const freshCall = fetchMock.mock.calls[0] as unknown as [unknown] | undefined;
    expect(String(freshCall?.[0] ?? "")).toContain("fresh=1");
  });
});

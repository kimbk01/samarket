/** @vitest-environment jsdom */
/**
 * W1 / A1 regression (Owner D1, 2026-10-05): the client keeps the last-good admin SSOT snapshot.
 * Device evidence: Phase 0-A T1-6 (admin asset) vs T1b (same device, > 60 s, `/sounds/notification.wav`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureNotificationSoundSsotHydratedForClient,
  hydrateNotificationSoundSsotFromApiResponse,
  resetNotificationSoundSsotClientHydrateForTests,
} from "@/lib/notifications/notification-sound-ssot-client-hydrate";
import {
  getNotificationSoundSsotSnapshotOrigin,
  invalidateNotificationSoundSsotCache,
  isNotificationSoundSsotClientRefreshRequested,
  resetNotificationSoundSsotSnapshotForTests,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";
import type {
  NotificationSoundAssetRow,
  NotificationSoundMappingRow,
} from "@/lib/notifications/notification-sound-types";

const EVENT = "messenger_direct_message_received";
const T0 = new Date("2026-10-05T14:00:00.000Z").getTime();
const SEC = 1_000;
const MIN = 60 * SEC;

function asset(id: string, url: string): NotificationSoundAssetRow {
  return {
    id,
    label: `${id}.mp3`,
    kind: "dibay_custom",
    domain: "messenger_direct",
    file_url: url,
    file_path: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: null,
    enabled: true,
  };
}

function mapping(assetId: string): NotificationSoundMappingRow {
  return {
    event_key: EVENT,
    asset_id: assetId,
    use_device_default: false,
    volume: 0.7,
    repeat_count: 1,
    cooldown_seconds: 0,
    vibration_enabled: null,
    priority: null,
    enabled: true,
  };
}

function apiBody(assetId: string, url: string) {
  return { ok: true, assets: [asset(assetId, url)], events: [], mappings: [mapping(assetId)] };
}

function mockFetchOk(assetId: string, url: string) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => apiBody(assetId, url) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchStatus(status: number) {
  const fn = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ADMIN_A = { id: "DIBAY-CUSTOM-SND-A", url: "https://cdn.example.com/admin-a.mp3" };
const ADMIN_B = { id: "DIBAY-CUSTOM-SND-B", url: "https://cdn.example.com/admin-b.mp3" };

function resolveWeb() {
  return resolveNotificationSound(EVENT, { platform: "web" });
}

describe("client last-good SSOT snapshot (A1)", () => {
  let registryAssetId = "";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    resetNotificationSoundSsotSnapshotForTests();
    resetNotificationSoundSsotClientHydrateForTests();
    vi.unstubAllGlobals();
    registryAssetId = resolveWeb().assetId;
    resetNotificationSoundSsotSnapshotForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetNotificationSoundSsotSnapshotForTests();
    resetNotificationSoundSsotClientHydrateForTests();
  });

  it.each([
    ["61s", 61 * SEC],
    ["5m", 5 * MIN],
    ["30m", 30 * MIN],
    ["2h", 120 * MIN],
  ])("keeps the admin asset after %s without any refresh", async (_label, elapsed) => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);

    vi.setSystemTime(T0 + elapsed);
    const r = resolveWeb();
    expect(r.assetId).toBe(ADMIN_A.id);
    expect(r.webUrl).toBe(ADMIN_A.url);
    expect(r.resolvedFrom).toBe("admin_mapping");
    expect(getNotificationSoundSsotSnapshotOrigin()).toBe("hydrated");
  });

  it("does not revert to registry when a refresh fails after TTL (503, then 2h later network error)", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));

    vi.setSystemTime(T0 + 61 * SEC);
    const f503 = mockFetchStatus(503);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(f503).toHaveBeenCalledTimes(1);
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);

    vi.setSystemTime(T0 + 120 * MIN);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    await ensureNotificationSoundSsotHydratedForClient();
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);
  });

  it("does not revert when the API answers ok:false (e.g. logged out / 401 body)", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));
    vi.setSystemTime(T0 + 5 * MIN);
    mockFetchStatus(401);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);
  });

  it("picks up an admin change after TTL on the next successful refresh", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));
    vi.setSystemTime(T0 + 61 * SEC);
    const f = mockFetchOk(ADMIN_B.id, ADMIN_B.url);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(f).toHaveBeenCalledTimes(1);
    expect(resolveWeb().webUrl).toBe(ADMIN_B.url);
  });

  it("invalidate keeps last-good, flags refresh, and the next ensure bypasses TTL", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));

    vi.setSystemTime(T0 + 10 * SEC); // inside 60 s TTL
    invalidateNotificationSoundSsotCache();
    expect(isNotificationSoundSsotClientRefreshRequested()).toBe(true);
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);

    const f = mockFetchOk(ADMIN_B.id, ADMIN_B.url);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(f).toHaveBeenCalledTimes(1);
    expect(resolveWeb().webUrl).toBe(ADMIN_B.url);
    expect(isNotificationSoundSsotClientRefreshRequested()).toBe(false);
  });

  it("invalidate followed by a failed refresh still keeps last-good", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));
    invalidateNotificationSoundSsotCache();
    mockFetchStatus(500);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);
    expect(isNotificationSoundSsotClientRefreshRequested()).toBe(true);
  });

  it("navigation / Prime remount inside TTL does not refetch and does not drop the snapshot", async () => {
    const f = mockFetchOk(ADMIN_A.id, ADMIN_A.url);
    await ensureNotificationSoundSsotHydratedForClient(); // first route mount
    vi.setSystemTime(T0 + 30 * SEC);
    await ensureNotificationSoundSsotHydratedForClient(); // route change remount
    await ensureNotificationSoundSsotHydratedForClient(); // first gesture
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 30 * MIN); // long session on a route without Prime: no refresh happens
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);
  });

  it("account switch: a later successful hydrate replaces the snapshot (config is global, not per user)", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));
    vi.setSystemTime(T0 + 2 * MIN);
    mockFetchOk(ADMIN_B.id, ADMIN_B.url);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(resolveWeb().webUrl).toBe(ADMIN_B.url);
    // user-level mute still applies on top of the global snapshot
    expect(resolveNotificationSound(EVENT, { platform: "web", userSoundEnabled: false }).kind).toBe("silent");
  });

  it("a client that never hydrated keeps the registry snapshot for 2h (unchanged first-boot behaviour)", () => {
    expect(resolveWeb().assetId).toBe(registryAssetId);
    vi.setSystemTime(T0 + 120 * MIN);
    expect(resolveWeb().assetId).toBe(registryAssetId);
    expect(getNotificationSoundSsotSnapshotOrigin()).toBe("registry");
  });

  it("invalidate before any hydrate keeps registry and requests a refresh", async () => {
    invalidateNotificationSoundSsotCache();
    expect(resolveWeb().assetId).toBe(registryAssetId);
    expect(isNotificationSoundSsotClientRefreshRequested()).toBe(true);
    mockFetchOk(ADMIN_A.id, ADMIN_A.url);
    await ensureNotificationSoundSsotHydratedForClient();
    expect(resolveWeb().webUrl).toBe(ADMIN_A.url);
  });

  it("full reset (fresh app process) returns to registry", async () => {
    await hydrateNotificationSoundSsotFromApiResponse(apiBody(ADMIN_A.id, ADMIN_A.url));
    resetNotificationSoundSsotSnapshotForTests();
    expect(resolveWeb().assetId).toBe(registryAssetId);
  });
});

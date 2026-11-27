// @vitest-environment jsdom
/**
 * 결함 2 — 다시 열기 인트로 발견은 마지막 성공 뒤 30분이 지났을 때만 (Owner 「결함 2 · 30분」 2026-11-27).
 * 새로 켤 때(OS release) 발견은 매번. 실패했으면 다음 다시 열기에 바로 다시 시도.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LIVE_OK = { ok: true, revision: 7, state: "active", publication: null };

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

async function loadDiscovery() {
  vi.resetModules();
  vi.doMock("@/lib/launch-intro/launch-epoch", async (orig) => ({
    ...(await orig<typeof import("@/lib/launch-intro/launch-epoch")>()),
    readLaunchEpoch: () => "22222222-2222-4222-8222-222222222222",
  }));
  vi.doMock("@/lib/launch-intro/os-release-owner", () => ({
    onLaunchOsReleased: (cb: () => void) => cb(),
  }));
  vi.doMock("@/lib/launch-intro/native-intro-client", () => ({ syncNativeIntroPool: async () => {} }));
  vi.doMock("@/lib/launch-intro/cache", () => ({
    readLaunchIntroIndex: () => ({ schema: 1, revision: 7, state: "active", publication: null, promotedAt: "x" }),
    promoteLaunchIntroIndex: () => true,
    acquireLaunchIntroAssets: async () => true,
    collectLaunchIntroAssetGarbage: async () => {},
    expireInactiveLaunchIntroIndex: () => null,
    startInactiveRetentionClock: () => null,
  }));
  vi.doMock("@/lib/launch-intro/startup-destination", () => ({
    getLaunchDestination: () => ({ destination: "community", reason: "x", snapshot: null }),
  }));
  return import("@/lib/launch-intro/discovery");
}

describe("launchIntroResumeDiscoveryDue (순수 판정)", () => {
  it("성공한 적 없으면 한다 · 30분 미만이면 안 한다 · 30분 이상이면 한다", async () => {
    const m = await loadDiscovery();
    expect(m.LAUNCH_INTRO_RESUME_DISCOVERY_MIN_INTERVAL_MS).toBe(30 * 60 * 1000);
    expect(m.launchIntroResumeDiscoveryDue(null, 0)).toBe(true);
    expect(m.launchIntroResumeDiscoveryDue(0, 30 * 60 * 1000 - 1)).toBe(false);
    expect(m.launchIntroResumeDiscoveryDue(0, 30 * 60 * 1000)).toBe(true);
  });
});

describe("다시 열기 발견 간격 (동작)", () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/launch-intro/launch-epoch");
    vi.doUnmock("@/lib/launch-intro/os-release-owner");
    vi.doUnmock("@/lib/launch-intro/native-intro-client");
    vi.doUnmock("@/lib/launch-intro/cache");
    vi.doUnmock("@/lib/launch-intro/startup-destination");
  });

  it("새로 켤 때 1번 → 30분 안 다시 열기 0번 → 30분 뒤 다시 열기 1번", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(LIVE_OK), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadDiscovery();
    m.startLaunchIntroDiscovery();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { "x-dibay-discovery-reason": "launch" } });

    for (let i = 0; i < 5; i += 1) {
      now += 60_000;
      setVisibility("hidden");
      setVisibility("visible");
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 30 * 60 * 1000;
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { "x-dibay-discovery-reason": "resume" } });
  });

  it("새로 켤 때 발견이 실패(5xx)하면 다음 다시 열기에 바로 다시 시도", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify(LIVE_OK), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadDiscovery();
    m.startLaunchIntroDiscovery();
    await flush();
    now += 5_000;
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    /** 이번엔 성공 — 이후 30분 안 다시 열기는 안 한다 */
    now += 5_000;
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AndroidPlayUpdateInfo } from "@/lib/platform/android-play-in-app-update-policy";

const native = vi.hoisted(() => ({
  getAndroidPlayUpdateInfo: vi.fn(),
  startAndroidFlexibleUpdate: vi.fn(),
  startAndroidImmediateUpdate: vi.fn(),
  completeAndroidFlexibleUpdate: vi.fn(),
}));

vi.mock("@/lib/platform/android-play-in-app-update", () => native);
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  resolveCapacitorShellPlatform: () => "android",
}));

const AVAILABLE: AndroidPlayUpdateInfo = {
  updateAvailability: "UPDATE_AVAILABLE",
  installStatus: "UNKNOWN",
  availableVersionCode: 19,
  installedVersionCode: 18,
  installedVersionName: "1.2.4",
  flexibleAllowed: true,
  immediateAllowed: true,
  callInProgress: false,
};

const fetchMock = vi.fn();

async function loadOrchestrator() {
  vi.resetModules();
  return import("@/lib/platform/android-play-in-app-update-orchestrator");
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

// Own storages (local Node 26 jsdom has no Web Storage; CI does) — same behavior everywhere.
let localStore: Storage = memoryStorage();
function installStorage(name: "localStorage" | "sessionStorage", store: Storage) {
  Object.defineProperty(window, name, { configurable: true, value: store });
}

/** Next app run: new module state, session storage gone, local storage kept. */
function simulateAppRestart() {
  installStorage("sessionStorage", memoryStorage());
}

beforeEach(() => {
  localStore = memoryStorage();
  installStorage("localStorage", localStore);
  installStorage("sessionStorage", memoryStorage());
  window.history.replaceState(null, "", "/home");
  document.body.innerHTML = "";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, androidMinVersionCode: null, androidImmediateUpdate: false }),
  });
  vi.stubGlobal("fetch", fetchMock);
  for (const fn of Object.values(native)) fn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("U5 server policy request", () => {
  it("does not call /api/me/settings/version when no update is available", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, updateAvailability: "UPDATE_NOT_AVAILABLE", availableVersionCode: 0 },
    });
    const o = await loadOrchestrator();
    const r = await o.runAndroidPlayInAppUpdateCheck();
    expect(r.reason).toBe("update_not_available");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call it for an already-downloaded update or during a call", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, installStatus: "DOWNLOADED" },
    });
    const o = await loadOrchestrator();
    await o.runAndroidPlayInAppUpdateCheck();
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, callInProgress: true },
    });
    await o.runAndroidPlayInAppUpdateCheck();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still fetches it when an update is available (IMMEDIATE policy preserved)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, androidMinVersionCode: "19", androidImmediateUpdate: false }),
    });
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    native.startAndroidImmediateUpdate.mockResolvedValue({ ok: true, result: { ok: true, status: "accepted" } });
    const o = await loadOrchestrator();
    const r = await o.runAndroidPlayInAppUpdateCheck();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ran: true, choice: "immediate" });
  });

  it("falls back safely (no force) when the policy request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    const o = await loadOrchestrator();
    const r = await o.runAndroidPlayInAppUpdateCheck();
    expect(r).toMatchObject({ reason: "awaiting_start_confirmation", choice: "flexible" });
    expect(native.startAndroidImmediateUpdate).not.toHaveBeenCalled();
  });
});

describe("U2 Play consent cancel", () => {
  it("records a 24h deferral for that build and suppresses the next auto prompt", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    native.startAndroidFlexibleUpdate.mockResolvedValue({ ok: true, result: { ok: false, status: "canceled" } });
    const o = await loadOrchestrator();
    const r = await o.runAndroidPlayInAppUpdateCheck({ confirmStart: true });
    expect(r).toMatchObject({ ran: true, choice: "flexible_canceled" });
    expect(JSON.parse(localStore.getItem("dibay.android.play_update.deferred") ?? "{}")).toMatchObject({
      versionCode: 19,
    });

    // Next app run (fresh module, session cooldown gone) → same build suppressed.
    simulateAppRestart();
    const next = await loadOrchestrator();
    const listener = vi.fn();
    next.subscribeAndroidFlexibleUpdateAvailable(listener);
    const again = await next.runAndroidPlayInAppUpdateCheck();
    expect(again.reason).toBe("deferred_same_build");
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not defer on Play failure or bridge error", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    native.startAndroidFlexibleUpdate.mockResolvedValue({ ok: true, result: { ok: false, status: "failed" } });
    const o = await loadOrchestrator();
    const failed = await o.runAndroidPlayInAppUpdateCheck({ confirmStart: true });
    expect(failed).toMatchObject({ ran: false, reason: "update_flow_failed" });

    native.startAndroidFlexibleUpdate.mockResolvedValue({
      ok: false,
      error: "x",
      code: "update_type_not_allowed",
    });
    const rejected = await o.runAndroidPlayInAppUpdateCheck({ confirmStart: true });
    expect(rejected).toMatchObject({ ran: false, reason: "update_type_not_allowed" });
    expect(localStore.getItem("dibay.android.play_update.deferred")).toBeNull();
  });

  it("IMMEDIATE cancel does not record the general-update deferral", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, androidMinVersionCode: null, androidImmediateUpdate: true }),
    });
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    native.startAndroidImmediateUpdate.mockResolvedValue({ ok: true, result: { ok: false, status: "canceled" } });
    const o = await loadOrchestrator();
    const r = await o.runAndroidPlayInAppUpdateCheck();
    expect(r).toMatchObject({ choice: "immediate_canceled" });
    expect(localStore.getItem("dibay.android.play_update.deferred")).toBeNull();
  });
});

describe("U3 confirm during a running check", () => {
  it("waits for the running check and starts once (no in_flight close, no duplicate consent)", async () => {
    let release: (v: unknown) => void = () => {};
    native.getAndroidPlayUpdateInfo
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValue({ ok: true, info: AVAILABLE });
    native.startAndroidFlexibleUpdate.mockResolvedValue({ ok: true, result: { ok: true, status: "accepted" } });
    const o = await loadOrchestrator();
    const auto = o.runAndroidPlayInAppUpdateCheck();
    const confirm = o.runAndroidPlayInAppUpdateCheck({ confirmStart: true });
    release({ ok: true, info: AVAILABLE });
    expect(await auto).toMatchObject({ reason: "awaiting_start_confirmation" });
    expect(await confirm).toMatchObject({ ran: true, choice: "flexible" });
    expect(native.startAndroidFlexibleUpdate).toHaveBeenCalledTimes(1);
  });

  it("a second auto check during a running one is still skipped", async () => {
    let release: (v: unknown) => void = () => {};
    native.getAndroidPlayUpdateInfo.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const o = await loadOrchestrator();
    const first = o.runAndroidPlayInAppUpdateCheck();
    expect(await o.runAndroidPlayInAppUpdateCheck()).toMatchObject({ reason: "in_flight" });
    release({ ok: true, info: { ...AVAILABLE, updateAvailability: "UPDATE_NOT_AVAILABLE" } });
    await first;
  });
});

describe("U4 install confirm", () => {
  it("never turns 지금 설치 into a new download when the download is gone", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    const o = await loadOrchestrator();
    const r = await o.runAndroidPlayInAppUpdateCheck({ manual: true, confirmComplete: true });
    expect(r).toMatchObject({ ran: false, reason: "install_not_ready" });
    expect(native.startAndroidFlexibleUpdate).not.toHaveBeenCalled();
    expect(native.completeAndroidFlexibleUpdate).not.toHaveBeenCalled();
  });

  it("reports install failure and allows retry while still DOWNLOADED", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, installStatus: "DOWNLOADED" },
    });
    native.completeAndroidFlexibleUpdate
      .mockResolvedValueOnce({ ok: false, error: "x", code: "complete_failed" })
      .mockResolvedValueOnce({ ok: true });
    const o = await loadOrchestrator();
    expect(await o.runAndroidPlayInAppUpdateCheck({ manual: true, confirmComplete: true })).toMatchObject({
      ran: false,
      reason: "complete_failed",
    });
    expect(await o.runAndroidPlayInAppUpdateCheck({ manual: true, confirmComplete: true })).toMatchObject({
      ran: true,
      choice: "complete_flexible",
    });
  });

  it("call blocks install with a call reason", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, installStatus: "DOWNLOADED", callInProgress: true },
    });
    const o = await loadOrchestrator();
    expect(await o.runAndroidPlayInAppUpdateCheck({ manual: true, confirmComplete: true })).toMatchObject({
      reason: "downloaded_but_ui_blocked",
    });
  });
});

describe("D1–D3 regressions", () => {
  it("D3: install-ready dismissed this run → auto check does not re-notify", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, installStatus: "DOWNLOADED" },
    });
    const o = await loadOrchestrator();
    const listener = vi.fn();
    o.subscribeAndroidFlexibleInstallReady(listener);
    await o.runAndroidPlayInAppUpdateCheck();
    expect(listener).toHaveBeenCalledTimes(1);
    o.dismissAndroidFlexibleInstallReadyForThisRun();
    await o.runAndroidPlayInAppUpdateCheck();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("D1: a higher build prompts again after 나중에", async () => {
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    const o = await loadOrchestrator();
    o.acknowledgeAndroidPlayUpdateDeferred(19);
    simulateAppRestart();
    const next = await loadOrchestrator();
    native.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, availableVersionCode: 20 },
    });
    const listener = vi.fn();
    next.subscribeAndroidFlexibleUpdateAvailable(listener);
    expect(await next.runAndroidPlayInAppUpdateCheck()).toMatchObject({
      reason: "awaiting_start_confirmation",
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ availableVersionCode: 20 }));
  });
});

describe("forced (IMMEDIATE) update waits for a safe screen", () => {
  function immediatePolicy() {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, androidMinVersionCode: null, androidImmediateUpdate: true }),
    });
    native.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: AVAILABLE });
    native.startAndroidImmediateUpdate.mockResolvedValue({ ok: true, result: { ok: true, status: "accepted" } });
  }

  it.each([
    ["chat room", "/community-messenger/rooms/r1", "immediate_held_sensitive_route"],
    ["order chat", "/orders/store/o1/chat", "immediate_held_sensitive_route"],
    ["checkout", "/stores/kimbap/checkout", "immediate_held_sensitive_route"],
    ["write", "/write", "immediate_held_sensitive_route"],
  ])("holds on %s and notifies the Host", async (_l, path, reason) => {
    immediatePolicy();
    window.history.replaceState(null, "", path);
    const o = await loadOrchestrator();
    const held = vi.fn();
    o.subscribeAndroidImmediateUpdateHeld(held);
    expect(await o.runAndroidPlayInAppUpdateCheck()).toMatchObject({ ran: false, reason });
    expect(native.startAndroidImmediateUpdate).not.toHaveBeenCalled();
    expect(held).toHaveBeenCalledTimes(1);
  });

  it("holds while typing or while another dialog is open", async () => {
    immediatePolicy();
    const o = await loadOrchestrator();
    document.body.innerHTML = "<textarea id=t></textarea>";
    (document.getElementById("t") as HTMLTextAreaElement).focus();
    expect(await o.runAndroidPlayInAppUpdateCheck()).toMatchObject({ reason: "immediate_held_text_input" });
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(await o.runAndroidPlayInAppUpdateCheck()).toMatchObject({ reason: "immediate_held_other_overlay" });
    expect(native.startAndroidImmediateUpdate).not.toHaveBeenCalled();
  });

  it("a held start is not counted — the retry on a safe screen starts it", async () => {
    immediatePolicy();
    window.history.replaceState(null, "", "/community-messenger/rooms/r1");
    const o = await loadOrchestrator();
    await o.runAndroidPlayInAppUpdateCheck();
    window.history.replaceState(null, "", "/home");
    expect(await o.runAndroidPlayInAppUpdateCheck()).toMatchObject({ ran: true, choice: "immediate" });
    expect(native.startAndroidImmediateUpdate).toHaveBeenCalledTimes(1);
  });

  it("manual start from the version screen is not held", async () => {
    immediatePolicy();
    window.history.replaceState(null, "", "/mypage/settings/version");
    document.body.innerHTML = "<textarea id=t></textarea>";
    (document.getElementById("t") as HTMLTextAreaElement).focus();
    const o = await loadOrchestrator();
    expect(await o.runAndroidPlayInAppUpdateCheck({ manual: true })).toMatchObject({ ran: true, choice: "immediate" });
  });
});

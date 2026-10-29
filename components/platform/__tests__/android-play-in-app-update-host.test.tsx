/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  pathname: "/home",
  availableListeners: [] as Array<(p: Record<string, unknown>) => void>,
  installListeners: [] as Array<() => void>,
  immediateHeldListeners: [] as Array<() => void>,
  getAndroidPlayUpdateInfo: vi.fn(),
  runCheck: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ safeT: (k: string, f?: { fallbackKo?: string }) => f?.fallbackKo ?? k }),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  resolveCapacitorShellPlatform: () => "android",
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: async () => ({ remove: async () => {} }) },
}));
vi.mock("@/lib/platform/android-play-in-app-update", () => ({
  addAndroidFlexibleDownloadedListener: async () => ({ remove: async () => {} }),
  getAndroidPlayUpdateInfo: h.getAndroidPlayUpdateInfo,
}));
vi.mock("@/lib/platform/android-play-in-app-update-orchestrator", () => ({
  acknowledgeAndroidPlayUpdateDeferred: h.acknowledge,
  dismissAndroidFlexibleInstallReadyForThisRun: vi.fn(),
  isAndroidFlexibleInstallReadyDismissedForThisRun: () => false,
  runAndroidPlayInAppUpdateCheck: h.runCheck,
  subscribeAndroidFlexibleUpdateAvailable: (l: (p: Record<string, unknown>) => void) => {
    h.availableListeners.push(l);
    return () => {};
  },
  subscribeAndroidFlexibleInstallReady: (l: () => void) => {
    h.installListeners.push(l);
    return () => {};
  },
  subscribeAndroidImmediateUpdateHeld: (l: () => void) => {
    h.immediateHeldListeners.push(l);
    return () => {};
  },
}));

import { AndroidPlayInAppUpdateHost } from "@/components/platform/AndroidPlayInAppUpdateHost";

const AVAILABLE = {
  updateAvailability: "UPDATE_AVAILABLE",
  installStatus: "UNKNOWN",
  availableVersionCode: 19,
  installedVersionCode: 18,
  installedVersionName: "1.2.4",
  flexibleAllowed: true,
  immediateAllowed: true,
  callInProgress: false,
};

let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<AndroidPlayInAppUpdateHost />);
  });
  await flush();
}

async function rerender() {
  await act(async () => {
    root.render(<AndroidPlayInAppUpdateHost />);
  });
  await flush();
}

async function announceAvailable() {
  await act(async () => {
    for (const l of h.availableListeners) {
      l({ choice: "flexible", reason: "default_flexible", availableVersionCode: 19 });
    }
  });
  await flush();
}

async function announceInstallReady() {
  await act(async () => {
    for (const l of h.installListeners) l();
  });
  await flush();
}

const updateDialogShown = () =>
  document.body.textContent?.includes("새로운 DIBAY 업데이트가 있습니다") ?? false;
const installDialogShown = () =>
  document.body.textContent?.includes("업데이트가 준비되었습니다") ?? false;

function clickByText(text: string) {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!btn) throw new Error(`button ${text} not found`);
  btn.click();
}

beforeEach(() => {
  h.pathname = "/home";
  h.availableListeners.length = 0;
  h.installListeners.length = 0;
  h.immediateHeldListeners.length = 0;
  h.getAndroidPlayUpdateInfo.mockReset().mockResolvedValue({ ok: true, info: AVAILABLE });
  h.runCheck.mockReset().mockResolvedValue({ ran: false, reason: "noop" });
  h.acknowledge.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("AndroidPlayInAppUpdateHost — U1 timing", () => {
  it("shows on a safe screen with current version and new build", async () => {
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(true);
    expect(
      document.querySelector('[data-testid="android-play-update-versions"]')?.textContent
    ).toContain("1.2.4 (18)");
  });

  it("holds while typing in the chat composer, then shows after the keyboard closes", async () => {
    const composer = document.createElement("textarea");
    document.body.appendChild(composer);
    composer.focus();
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(false);
    await act(async () => {
      composer.blur();
    });
    await flush();
    await flush();
    expect(updateDialogShown()).toBe(true);
  });

  it("holds during intro / OS Start without asking Play", async () => {
    const intro = document.createElement("div");
    intro.setAttribute("data-launch-intro-overlay", "");
    document.body.appendChild(intro);
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(false);
    expect(h.getAndroidPlayUpdateInfo).not.toHaveBeenCalled();
  });

  it("holds while another modal is open", async () => {
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.setAttribute("aria-modal", "true");
    document.body.appendChild(other);
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(false);
  });

  it.each([
    "/community-messenger/rooms/r1",
    "/stores/kimbap/checkout",
    "/community-messenger/calls-v4/c1",
    "/write",
  ])("holds on %s and shows after moving to a safe screen", async (pathname) => {
    h.pathname = pathname;
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(false);
    h.pathname = "/home";
    await rerender();
    expect(updateDialogShown()).toBe(true);
  });

  it("does not show a held prompt once Play reports the update installed", async () => {
    h.pathname = "/community-messenger/rooms/r1";
    await mount();
    await announceAvailable();
    h.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, updateAvailability: "UPDATE_NOT_AVAILABLE", availableVersionCode: 0 },
    });
    h.pathname = "/home";
    await rerender();
    expect(updateDialogShown()).toBe(false);
  });

  it("holds during a native call (Play callInProgress)", async () => {
    h.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, callInProgress: true },
    });
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(false);
  });

  it("an open prompt yields to an incoming-call banner without recording 나중에", async () => {
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(true);
    const banner = document.createElement("div");
    banner.setAttribute("role", "dialog");
    banner.setAttribute("data-testid", "incoming-call-banner");
    await act(async () => {
      document.body.appendChild(banner);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(updateDialogShown()).toBe(false);
    expect(h.acknowledge).not.toHaveBeenCalled();
  });

  it("an open prompt yields when navigating into a call screen", async () => {
    await mount();
    await announceAvailable();
    expect(updateDialogShown()).toBe(true);
    h.pathname = "/community-messenger/calls-v4/c1";
    await rerender();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(updateDialogShown()).toBe(false);
  });
});

describe("AndroidPlayInAppUpdateHost — U3 / U4 CTA results", () => {
  it("U3: start failure keeps the dialog open with an error", async () => {
    h.runCheck.mockResolvedValue({ ran: false, reason: "update_flow_failed" });
    await mount();
    await announceAvailable();
    await act(async () => clickByText("지금 업데이트"));
    await flush();
    expect(updateDialogShown()).toBe(true);
    expect(
      document.querySelector('[data-testid="android-play-update-error"]')?.textContent
    ).toBe("업데이트를 시작하지 못했습니다");
  });

  it("U3: accepted start closes the dialog", async () => {
    h.runCheck.mockResolvedValue({ ran: true, reason: "default_flexible", choice: "flexible" });
    await mount();
    await announceAvailable();
    await act(async () => clickByText("지금 업데이트"));
    await flush();
    expect(updateDialogShown()).toBe(false);
    expect(h.runCheck).toHaveBeenCalledWith({ confirmStart: true });
  });

  it("U4: install failure keeps the install dialog open with an error", async () => {
    h.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, installStatus: "DOWNLOADED" },
    });
    h.runCheck.mockResolvedValue({ ran: false, reason: "complete_failed" });
    await mount();
    await announceInstallReady();
    expect(installDialogShown()).toBe(true);
    await act(async () => clickByText("지금 설치"));
    await flush();
    expect(installDialogShown()).toBe(true);
    expect(
      document.querySelector('[data-testid="android-play-update-error"]')?.textContent
    ).toBe("업데이트 설치를 시작하지 못했습니다");
  });

  it("U4: stale install dialog closes when the download is gone", async () => {
    h.getAndroidPlayUpdateInfo.mockResolvedValue({
      ok: true,
      info: { ...AVAILABLE, installStatus: "DOWNLOADED" },
    });
    h.runCheck.mockResolvedValue({ ran: false, reason: "install_not_ready" });
    await mount();
    await announceInstallReady();
    await act(async () => clickByText("지금 설치"));
    await flush();
    expect(installDialogShown()).toBe(false);
  });

  it("install-ready event is not shown when Play no longer reports DOWNLOADED", async () => {
    await mount();
    await announceInstallReady();
    expect(installDialogShown()).toBe(false);
  });

  it("나중에 records the deferral for the shown build", async () => {
    await mount();
    await announceAvailable();
    await act(async () => clickByText("나중에"));
    await flush();
    expect(h.acknowledge).toHaveBeenCalledWith(19);
    expect(updateDialogShown()).toBe(false);
  });
});

describe("AndroidPlayInAppUpdateHost — forced (IMMEDIATE) update held while busy", () => {
  it("retries the held forced update only after leaving the chat room", async () => {
    h.pathname = "/community-messenger/rooms/r1";
    await mount();
    h.runCheck.mockClear();
    await act(async () => {
      for (const l of h.immediateHeldListeners) l();
    });
    await flush();
    expect(h.runCheck).not.toHaveBeenCalled();
    h.pathname = "/home";
    await rerender();
    expect(h.runCheck).toHaveBeenCalledTimes(1);
    expect(h.runCheck).toHaveBeenCalledWith();
  });

  it("waits while typing, retries after the keyboard closes", async () => {
    const composer = document.createElement("textarea");
    document.body.appendChild(composer);
    composer.focus();
    await mount();
    h.runCheck.mockClear();
    await act(async () => {
      for (const l of h.immediateHeldListeners) l();
    });
    await flush();
    expect(h.runCheck).not.toHaveBeenCalled();
    await act(async () => {
      composer.blur();
    });
    await flush();
    await flush();
    expect(h.runCheck).toHaveBeenCalledTimes(1);
  });
});

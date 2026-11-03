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
  screenRequestListeners: [] as Array<(r: { action: "start" | "install" }) => void>,
  statusListeners: [] as Array<(e: Record<string, unknown>) => void>,
  downloadedNative: [] as Array<() => void>,
  push: vi.fn(),
  getAndroidPlayUpdateInfo: vi.fn(),
  runCheck: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", { alt: String(props.alt ?? "") }),
}));
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
  addAndroidFlexibleDownloadedListener: async (l: () => void) => {
    h.downloadedNative.push(l);
    return { remove: async () => {} };
  },
  addAndroidPlayInstallStatusListener: async (l: (e: Record<string, unknown>) => void) => {
    h.statusListeners.push(l);
    return { remove: async () => {} };
  },
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
  subscribeAndroidPlayUpdateScreenRequest: (l: (r: { action: "start" | "install" }) => void) => {
    h.screenRequestListeners.push(l);
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

async function announceAvailable(extra: Record<string, unknown> = {}) {
  await act(async () => {
    for (const l of h.availableListeners) {
      l({ choice: "flexible", reason: "default_flexible", availableVersionCode: 19, ...extra });
    }
  });
  await flush();
}

async function emitStatus(event: Record<string, unknown>) {
  await act(async () => {
    for (const l of h.statusListeners) l(event);
  });
  await flush();
}

const screenEl = () =>
  document.querySelector<HTMLElement>('[data-testid="android-play-update-screen"]');
const screenStep = () => screenEl()?.dataset.step ?? null;

async function announceInstallReady() {
  await act(async () => {
    for (const l of h.installListeners) l();
  });
  await flush();
}

const updateDialogShown = () => screenStep() === "intro";
const installDialogShown = () => screenStep() === "ready";

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
  h.screenRequestListeners.length = 0;
  h.statusListeners.length = 0;
  h.downloadedNative.length = 0;
  h.push.mockReset();
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
    await act(async () => clickByText("업데이트"));
    await flush();
    expect(updateDialogShown()).toBe(true);
    expect(
      document.querySelector('[data-testid="android-play-update-error"]')?.textContent
    ).toBe("업데이트를 시작하지 못했습니다");
  });

  it("U3: accepted start stays on the same screen as 「업데이트 준비 중…」 (no close)", async () => {
    h.runCheck.mockResolvedValue({ ran: true, reason: "default_flexible", choice: "flexible" });
    await mount();
    await announceAvailable();
    await act(async () => clickByText("업데이트"));
    await flush();
    expect(screenStep()).toBe("preparing");
    expect(document.body.textContent).toContain("업데이트 준비 중…");
    expect(h.runCheck).toHaveBeenCalledWith({ confirmStart: true });
  });

  it("Play consent closed → back to the first step without an error", async () => {
    h.runCheck.mockResolvedValue({ ran: true, reason: "default_flexible", choice: "flexible_canceled" });
    await mount();
    await announceAvailable();
    await act(async () => clickByText("업데이트"));
    await flush();
    expect(screenStep()).toBe("intro");
    expect(document.querySelector('[data-testid="android-play-update-error"]')).toBeNull();
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
    await act(async () => clickByText("설치"));
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
    await act(async () => clickByText("설치"));
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

describe("AndroidPlayInAppUpdateHost — full-screen progress (Owner 2026-11-03)", () => {
  async function startDownload() {
    h.runCheck.mockResolvedValue({ ran: true, reason: "default_flexible", choice: "flexible" });
    await mount();
    await announceAvailable();
    await act(async () => clickByText("업데이트"));
    await flush();
  }

  it("shows 다운로드 중… with the Play byte percent on the same screen", async () => {
    await startDownload();
    await emitStatus({ installStatus: "DOWNLOADING", bytesDownloaded: 16, totalBytesToDownload: 100 });
    expect(screenStep()).toBe("downloading");
    expect(document.querySelector('[data-testid="android-play-update-percent"]')?.textContent).toBe("16%");
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("16");
    await emitStatus({ installStatus: "DOWNLOADING", bytesDownloaded: 73, totalBytesToDownload: 100 });
    expect(document.querySelector('[data-testid="android-play-update-percent"]')?.textContent).toBe("73%");
  });

  it("download finished while open → installs without a second confirm, then 설치 중…", async () => {
    await startDownload();
    h.runCheck.mockClear().mockResolvedValue({ ran: true, reason: "flexible_downloaded", choice: "complete_flexible" });
    await emitStatus({ installStatus: "DOWNLOADED" });
    await flush();
    expect(h.runCheck).toHaveBeenCalledWith({ manual: true, confirmComplete: true });
    expect(screenStep()).toBe("installing");
    expect(document.body.textContent).toContain("설치 중…");
    expect(document.body.textContent).not.toContain("닫기");
  });

  it("download finished during a call → waits on the screen instead of an error", async () => {
    await startDownload();
    h.runCheck.mockClear().mockResolvedValue({ ran: false, reason: "downloaded_but_ui_blocked" });
    await emitStatus({ installStatus: "DOWNLOADED" });
    await flush();
    expect(screenStep()).toBe("preparing");
    expect(document.querySelector('[data-testid="android-play-update-wait-call"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="android-play-update-error"]')).toBeNull();
  });

  it("닫기 hides the screen; the finished download reopens it as 「설치」", async () => {
    await startDownload();
    await emitStatus({ installStatus: "DOWNLOADING", bytesDownloaded: 10, totalBytesToDownload: 100 });
    await act(async () => clickByText("닫기"));
    await flush();
    expect(screenEl()).toBeNull();
    h.getAndroidPlayUpdateInfo.mockResolvedValue({ ok: true, info: { ...AVAILABLE, installStatus: "DOWNLOADED" } });
    await act(async () => {
      for (const l of h.downloadedNative) l();
    });
    await flush();
    await flush();
    expect(screenStep()).toBe("ready");
  });

  it("Play download failure returns to the first step with 다시 시도", async () => {
    await startDownload();
    await emitStatus({ installStatus: "FAILED" });
    expect(screenStep()).toBe("intro");
    expect(document.querySelector('[data-testid="android-play-update-error"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="android-play-update-cta"]')?.textContent).toBe("다시 시도");
  });

  it("forced update: same screen without 나중에 / 닫기", async () => {
    h.runCheck.mockResolvedValue({ ran: true, reason: "server_policy_forced", choice: "flexible" });
    await mount();
    await announceAvailable({ forced: true, reason: "server_policy_forced" });
    expect(screenEl()?.dataset.forced).toBe("true");
    expect(document.body.textContent).toContain("DIBAY 앱을 사용하기 전에 최신 버전으로 업데이트해주세요.");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "나중에")).toBe(false);
    await act(async () => clickByText("업데이트"));
    await flush();
    await emitStatus({ installStatus: "DOWNLOADING", bytesDownloaded: 5, totalBytesToDownload: 10 });
    expect(screenStep()).toBe("downloading");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "닫기")).toBe(false);
  });

  it("version screen 「업데이트」 opens the same screen and starts right away (manual)", async () => {
    h.runCheck.mockResolvedValue({ ran: true, reason: "default_flexible", choice: "flexible" });
    await mount();
    await act(async () => {
      for (const l of h.screenRequestListeners) l({ action: "start" });
    });
    await flush();
    expect(screenStep()).toBe("preparing");
    expect(h.runCheck).toHaveBeenCalledWith({ manual: true, confirmStart: true });
  });

  it("상세 정보 보기 closes the screen without recording 나중에 and opens the release history", async () => {
    await mount();
    await announceAvailable();
    await act(async () => clickByText("상세 정보 보기"));
    await flush();
    expect(screenEl()).toBeNull();
    expect(h.acknowledge).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith("/mypage/app-updates");
  });
});

describe("AndroidPlayInAppUpdateHost — 2단계 예상 크기 · 재시작 후 %", () => {
  it("shows 예상 크기 only when the native build reports a size", async () => {
    await mount();
    await announceAvailable({ totalBytesToDownload: 18 * 1024 * 1024 });
    expect(document.querySelector('[data-testid="android-play-update-size"]')?.textContent).toContain("18MB");
  });

  it("hides 예상 크기 for an older binary (no size)", async () => {
    await mount();
    await announceAvailable();
    expect(document.querySelector('[data-testid="android-play-update-size"]')).toBeNull();
  });

  it("a status read with byte counts restores the percent (no live event needed)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      h.runCheck.mockResolvedValue({ ran: true, reason: "default_flexible", choice: "flexible" });
      await mount();
      await announceAvailable();
      await act(async () => clickByText("업데이트"));
      await flush();
      h.getAndroidPlayUpdateInfo.mockResolvedValue({
        ok: true,
        info: { ...AVAILABLE, installStatus: "DOWNLOADING", bytesDownloaded: 40, totalBytesToDownload: 80 },
      });
      await act(async () => {
        vi.advanceTimersByTime(3_100);
      });
      await flush();
      expect(screenStep()).toBe("downloading");
      expect(document.querySelector('[data-testid="android-play-update-percent"]')?.textContent).toBe("50%");
    } finally {
      vi.useRealTimers();
    }
  });
});

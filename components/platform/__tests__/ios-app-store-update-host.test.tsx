/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  pathname: "/home",
  platform: "ios" as "ios" | "android",
  installed: "1.2.7" as string | null,
  callId: null as string | null,
}));

vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", { alt: String(props.alt ?? "") }),
}));
vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  const { safeTranslate } = await import("@/lib/i18n/safe-translate");
  return {
    useI18n: () => ({
      safeT: (k: string, o?: Parameters<typeof safeTranslate>[2]) => safeTranslate("ko", k as never, o),
      /** 오버레이 닫기 aria(`common_close`)가 `t` 를 쓴다 — 언어 재감사 2026-11-27 */
      t: (k: string, vars?: Record<string, string | number>) => safeTranslate("ko", k as never, { vars }),
    }),
  };
});
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  resolveCapacitorShellPlatform: () => h.platform,
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: async () => ({ remove: async () => {} }) },
}));
vi.mock("@/lib/platform/android-play-in-app-update", () => ({
  getCapacitorAppInstalledVersion: async () => (h.installed ? { versionName: h.installed, versionCode: 63 } : null),
}));
vi.mock("@/lib/call/active-call-session", () => ({
  getActiveCallSessionCallId: () => h.callId,
}));

import { IosAppStoreUpdateHost } from "@/components/platform/IosAppStoreUpdateHost";
import { IOS_UPDATE_DEFERRAL_STORAGE_KEY } from "@/lib/platform/ios-app-store-update-policy";

let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let openMock: ReturnType<typeof vi.fn>;
const store = new Map<string, string>();

function mount() {
  act(() => {
    root.render(<IosAppStoreUpdateHost />);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const screen = () => document.querySelector('[data-testid="ios-app-store-update-screen"]');

beforeEach(() => {
  vi.useFakeTimers();
  h.pathname = "/home";
  h.platform = "ios";
  h.installed = "1.2.7";
  h.callId = null;
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ version: "1.2.8" }] })));
  vi.stubGlobal("fetch", fetchMock);
  openMock = vi.fn();
  vi.stubGlobal("open", openMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("IosAppStoreUpdateHost", () => {
  it("앱을 열고 8초 뒤 새 버전이면 안내를 띄우고, 「업데이트」는 App Store DIBAY 화면을 연다", async () => {
    mount();
    await advance(7_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(1_500);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/bundleId=com\.dibay\.ph&country=ph&_=\d+$/);
    expect(screen()).not.toBeNull();
    expect(document.body.textContent).toContain("1.2.7");
    expect(document.body.textContent).toContain("1.2.8");
    act(() => {
      (document.querySelector('[data-testid="ios-app-store-update-cta"]') as HTMLButtonElement).click();
    });
    expect(openMock).toHaveBeenCalledWith("https://apps.apple.com/ph/app/id6831952401", "_system");
    await advance(500);
    expect(screen()).toBeNull();
  });

  it("최신이면 띄우지 않는다", async () => {
    h.installed = "1.2.8";
    mount();
    await advance(9_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen()).toBeNull();
  });

  it("Apple 조회 실패면 띄우지 않는다", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    mount();
    await advance(9_000);
    expect(screen()).toBeNull();
  });

  it("「나중에」는 같은 버전을 24시간 미룬다", async () => {
    mount();
    await advance(9_000);
    act(() => {
      (document.querySelector('[data-testid="ios-app-store-update-later"]') as HTMLButtonElement).click();
    });
    await advance(500);
    expect(screen()).toBeNull();
    expect(JSON.parse(store.get(IOS_UPDATE_DEFERRAL_STORAGE_KEY) ?? "{}")).toMatchObject({ version: "1.2.8" });
  });

  it("채팅방·통화 중에는 기다렸다가 나온 뒤 띄운다", async () => {
    h.pathname = "/community-messenger/rooms/abc";
    mount();
    await advance(9_000);
    expect(screen()).toBeNull();
    h.pathname = "/home";
    h.callId = "call-1";
    act(() => root.render(<IosAppStoreUpdateHost />));
    await advance(3_500);
    expect(screen()).toBeNull();
    h.callId = null;
    await advance(3_500);
    expect(screen()).not.toBeNull();
  });

  it("Android 에서는 아무것도 하지 않는다", async () => {
    h.platform = "android";
    mount();
    await advance(9_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen()).toBeNull();
  });
});

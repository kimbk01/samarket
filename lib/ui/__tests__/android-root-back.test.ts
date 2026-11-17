/**
 * D1 — 웹 기록 첫 항목에서만 ◁ 리스너를 켠다 (감사 docs/audit/android-system-nav-2026-11-17/README.md).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { isNavigationRootEntry, startAndroidRootBackTracking } from "@/lib/ui/android-root-back";
import {
  __setOverlayBackListenerDriverForTests,
  isOverlayBackListenerInstalled,
} from "@/lib/ui/overlay-back-stack";

function fakeNav(index: number) {
  const listeners = new Set<() => void>();
  const nav = {
    currentEntry: { index } as { index: number } | null,
    addEventListener: (_t: "currententrychange", fn: () => void) => listeners.add(fn),
    removeEventListener: (_t: "currententrychange", fn: () => void) => listeners.delete(fn),
  };
  const go = (next: number) => {
    nav.currentEntry = { index: next };
    for (const fn of [...listeners]) fn();
  };
  return { nav, go, listeners };
}

function useFakeDriver() {
  __setOverlayBackListenerDriverForTests({ install: () => () => {}, minimize: () => {} });
}

afterEach(() => __setOverlayBackListenerDriverForTests(null));

describe("android-root-back", () => {
  it("첫 항목에서만 켜지고, 다음 화면으로 가면 꺼지고, 돌아오면 다시 켜진다", () => {
    useFakeDriver();
    const f = fakeNav(0);
    const stop = startAndroidRootBackTracking({ platform: "android", nav: f.nav });
    expect(isOverlayBackListenerInstalled()).toBe(true);
    f.go(1);
    expect(isOverlayBackListenerInstalled()).toBe(false);
    f.go(0);
    expect(isOverlayBackListenerInstalled()).toBe(true);
    stop();
    expect(isOverlayBackListenerInstalled()).toBe(false);
    expect(f.listeners.size).toBe(0);
  });

  it("Android 가 아니면 아무것도 하지 않는다(iOS·웹·Windows)", () => {
    useFakeDriver();
    for (const platform of ["ios", "web", "windows"]) {
      const f = fakeNav(0);
      startAndroidRootBackTracking({ platform, nav: f.nav })();
      expect(f.listeners.size).toBe(0);
      expect(isOverlayBackListenerInstalled()).toBe(false);
    }
  });

  it("Navigation API 가 없으면 지금 동작 그대로(리스너 없음)", () => {
    useFakeDriver();
    startAndroidRootBackTracking({ platform: "android", nav: null })();
    expect(isOverlayBackListenerInstalled()).toBe(false);
    expect(isNavigationRootEntry(null)).toBe(false);
  });

  it("메인 앱 공급자 트리에 1곳만 장착된다", () => {
    const tree = readFileSync("components/layout/MainAppProviderTree.tsx", "utf8");
    expect(tree.match(/<AndroidRootBackHost \/>/g)?.length).toBe(1);
  });
});

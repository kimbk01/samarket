// @vitest-environment jsdom
/**
 * 결함 E — 알림 이동 직후 화면에서만 Android 시스템 뒤로를 history.back() 으로.
 * 설계 docs/design/push-entry-back-fix-design-2026-11-13.md
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPushNavigationBackForTests,
  isPushNavigationBackActive,
  markLeavingByPushNavigation,
} from "@/lib/push/push-navigation-back";
import {
  __setOverlayBackListenerDriverForTests,
  isOverlayBackListenerInstalled,
  pushOverlayBackEntry,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

/** Navigation API 흉내 — entries 배열 + 현재 위치, currententrychange 발생. */
function fakeNavigation() {
  const entries: { key: string; index: number }[] = [{ key: "k0", index: 0 }];
  let cur = 0;
  const listeners = new Set<() => void>();
  let n = 1;
  const nav = {
    get currentEntry() {
      return entries[cur] ?? null;
    },
    entries: () => entries.slice(),
    addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
  };
  const fire = () => listeners.forEach((f) => f());
  return {
    nav,
    push() {
      entries.splice(cur + 1);
      entries.push({ key: `k${n++}`, index: entries.length });
      cur = entries.length - 1;
      fire();
    },
    back() {
      if (cur > 0) cur -= 1;
      fire();
    },
  };
}

function fakeDriver() {
  const state = { installs: 0, removes: 0, onBack: null as null | ((ev: { canGoBack?: boolean }) => void) };
  const driver: OverlayBackListenerDriver = {
    install(onBack) {
      state.installs += 1;
      state.onBack = onBack;
      return () => {
        state.removes += 1;
        state.onBack = null;
      };
    },
  };
  return { driver, state };
}

let f: ReturnType<typeof fakeNavigation>;
let d: ReturnType<typeof fakeDriver>;
let historyBack: ReturnType<typeof vi.fn>;

beforeEach(() => {
  f = fakeNavigation();
  (window as unknown as { navigation: unknown }).navigation = f.nav;
  d = fakeDriver();
  __setOverlayBackListenerDriverForTests(d.driver);
  historyBack = vi.fn(() => f.back());
  vi.spyOn(window.history, "back").mockImplementation(historyBack);
});
afterEach(() => {
  __resetPushNavigationBackForTests();
  __setOverlayBackListenerDriverForTests(null);
  vi.restoreAllMocks();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe("알림 이동 직후 화면에서만 뒤로 담당", () => {
  it("알림 이동 전에는 리스너 없음(지금 동작)", () => {
    expect(isOverlayBackListenerInstalled()).toBe(false);
  });

  it("알림 이동 2회(E 재현) → 뒤로 2회가 직전 화면 순서로, 첫 화면에서 리스너 제거", () => {
    markLeavingByPushNavigation();
    f.push(); // /stores
    markLeavingByPushNavigation();
    f.push(); // /search
    expect(isPushNavigationBackActive()).toBe(true);
    expect(isOverlayBackListenerInstalled()).toBe(true);
    d.state.onBack?.({ canGoBack: false });
    expect(f.nav.currentEntry?.key).toBe("k1");
    expect(isOverlayBackListenerInstalled()).toBe(true);
    d.state.onBack?.({ canGoBack: false });
    expect(f.nav.currentEntry?.key).toBe("k0");
    expect(isOverlayBackListenerInstalled()).toBe(false); // 첫 화면 = 지금 동작
    expect(historyBack).toHaveBeenCalledTimes(2);
  });

  it("알림 진입 뒤 일반 이동 → 리스너 제거(일반 화면 뒤로는 그대로)", () => {
    markLeavingByPushNavigation();
    f.push();
    expect(isOverlayBackListenerInstalled()).toBe(true);
    f.push(); // 사용자 링크 이동(표시 안 함)
    expect(isPushNavigationBackActive()).toBe(false);
    expect(isOverlayBackListenerInstalled()).toBe(false);
  });

  it("오버레이가 열려 있으면 오버레이만 닫고 이동하지 않음", () => {
    markLeavingByPushNavigation();
    f.push();
    const close = vi.fn();
    const release = pushOverlayBackEntry(close);
    d.state.onBack?.({ canGoBack: false });
    expect(close).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
    release();
    expect(isOverlayBackListenerInstalled()).toBe(true); // 알림 이동 직후 화면이라 유지
  });

  it("Navigation API 없음 → 표시·담당 없음(지금 동작)", () => {
    delete (window as unknown as { navigation?: unknown }).navigation;
    markLeavingByPushNavigation();
    expect(isPushNavigationBackActive()).toBe(false);
    expect(isOverlayBackListenerInstalled()).toBe(false);
  });
});

describe("구조 계약", () => {
  const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it("알림 이동 표시는 비통화 router.push 직전 1곳뿐", () => {
    expect(listener.match(/markLeavingByPushNavigation\(\);/g)?.length).toBe(1);
    expect(listener).toMatch(/markLeavingByPushNavigation\(\);\s*router\.push\(path\);/);
  });
  const mod = readFileSync("lib/push/push-navigation-back.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("타이머·비동기 없음", () => {
    expect(mod).not.toMatch(/setTimeout|setInterval|await |Promise/);
  });
});

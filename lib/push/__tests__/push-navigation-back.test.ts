// @vitest-environment jsdom
/**
 * 결함 E — 알림 이동 직후 화면에서만 Android 시스템 뒤로를 history.back() 으로.
 * 설계 docs/design/push-entry-back-fix-design-2026-11-13.md
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMessengerRoomEntryOrigin } from "@/lib/community-messenger/room/messenger-room-entry-origin-store";
import {
  __resetPushNavigationBackForTests,
  isEntryLeftByPushNavigation,
  isPushNavigationBackActive,
  markLeavingByPushNavigation,
  restorePushNavigationBackAfterReload,
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
  const listeners = new Set<(ev?: { navigationType?: string }) => void>();
  let n = 1;
  const nav = {
    get currentEntry() {
      return entries[cur] ?? null;
    },
    entries: () => entries.slice(),
    addEventListener: (_t: string, fn: (ev?: { navigationType?: string }) => void) => listeners.add(fn),
    removeEventListener: (_t: string, fn: (ev?: { navigationType?: string }) => void) => listeners.delete(fn),
  };
  const fire = (navigationType: string) => listeners.forEach((f) => f({ navigationType }));
  return {
    nav,
    push() {
      entries.splice(cur + 1);
      entries.push({ key: `k${n++}`, index: entries.length });
      cur = entries.length - 1;
      fire("push");
    },
    /** replace — 항목 key 유지 */
    replace() {
      fire("replace");
    },
    back() {
      if (cur > 0) cur -= 1;
      fire("traverse");
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

describe("P5 검토 1 — 표시된 항목으로 돌아오면 표시를 지운다", () => {
  it("목록→A→알림 B→◁(목록 replace)→◁(A)→배너 C: C 는 앱 안 진입(push 오판 없음)", () => {
    f.push(); // k1 = A (사용자 이동)
    markLeavingByPushNavigation(); // A 표시
    f.push(); // k2 = B (알림 진입)
    expect(isPushNavigationBackActive()).toBe(true);
    f.replace(); // B 의 ◁ = 방 종류 목록 replace (key k2 유지)
    expect(isEntryLeftByPushNavigation("k1")).toBe(true);
    d.state.onBack?.({ canGoBack: false }); // 목록에서 ◁ = 결함 E history.back → A
    expect(f.nav.currentEntry?.key).toBe("k1");
    expect(isEntryLeftByPushNavigation("k1")).toBe(false);
    expect(isOverlayBackListenerInstalled()).toBe(false);
    f.push(); // A 에서 배너로 C (사용자 이동)
    expect(isPushNavigationBackActive()).toBe(false);
    window.history.replaceState(null, "", "/community-messenger/rooms/C");
    expect(resolveMessengerRoomEntryOrigin()).toBe("in_app");
    window.sessionStorage.clear();
  });

  it("표시 직후 같은 항목의 replace(이동 전 내부 replaceState)는 표시를 지우지 않음", () => {
    markLeavingByPushNavigation();
    f.replace();
    expect(isEntryLeftByPushNavigation("k0")).toBe(true);
  });

  it("저장소 쓰기 실패 뒤에는 메모리 값을 읽는다", () => {
    markLeavingByPushNavigation(); // 저장소에 k0
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    f.push();
    f.back(); // k0 으로 돌아옴 → 표시 제거(쓰기는 실패, 메모리만)
    expect(isEntryLeftByPushNavigation("k0")).toBe(false);
    setItem.mockRestore();
  });
});

describe("P5 §A7 — reload 뒤 유지(sessionStorage)", () => {
  it("표시는 sessionStorage 에 남고, reload 뒤 복원하면 같은 화면에서 뒤로 담당", () => {
    markLeavingByPushNavigation();
    f.push();
    expect(window.sessionStorage.getItem("dibay:push-left-entries")).toBe(JSON.stringify(["k0"]));
    // reload 모사: 리스너·활성 상태만 초기화(저장소는 유지)
    __setOverlayBackListenerDriverForTests(d.driver);
    expect(isOverlayBackListenerInstalled()).toBe(false);
    restorePushNavigationBackAfterReload();
    expect(isPushNavigationBackActive()).toBe(true);
    expect(isOverlayBackListenerInstalled()).toBe(true);
  });

  it("표시가 없으면 복원은 아무것도 하지 않음", () => {
    restorePushNavigationBackAfterReload();
    expect(isOverlayBackListenerInstalled()).toBe(false);
  });

  it("상한 50", () => {
    for (let i = 0; i < 55; i += 1) {
      markLeavingByPushNavigation();
      f.push();
    }
    const saved = JSON.parse(window.sessionStorage.getItem("dibay:push-left-entries") ?? "[]") as string[];
    expect(saved).toHaveLength(50);
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

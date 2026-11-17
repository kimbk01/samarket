// @vitest-environment jsdom
/**
 * N1 (docs/audit/messenger-chat-fix-design-2026-11-18.md PR-2) — 알림 진입 방 → ◁(목록 replace) → ◁ 가
 * 이전 방·같은 목록으로 가지 않는다. 알림 진입 표시(push-navigation-back)는 유지하고, 목록 replace 직전에
 * 바로 앞 항목의 표시만 정리한다.
 *
 * 모델(코드로 확인 가능한 범위만):
 * - 웹 쪽 처리는 실제 모듈(push-navigation-back · overlay-back-stack · messenger-room-back-target · 진입 출처 저장소).
 * - Android 기본 뒤로(웹 리스너 없음)는 Chromium history manipulation intervention 대로 흉내 낸다:
 *   사용자 활성화 없이 다음 기록을 만든 항목(알림 이동으로 떠난 항목)은 건너뛰고, 건너뛰기 아닌 앞 항목이 없으면
 *   canGoBack=false(무반응·나감). 근거: docs/design/push-entry-back-fix-design-2026-11-13.md §1 (11-13 실측).
 *   이 흉내는 실기기 동작의 대체가 아니다 — 실기기 결과는 NOT_PROVEN.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMessengerRoomEntryOriginForTests } from "@/lib/community-messenger/room/messenger-room-entry-origin-store";
import {
  resolveMessengerRoomBackTargetNow,
  runMessengerRoomBackTarget,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";
import {
  __resetPushNavigationBackForTests,
  clearPushNavigationMarkBeforeListReplace,
  isEntryLeftByPushNavigation,
  isPushNavigationBackActive,
  markLeavingByPushNavigation,
} from "@/lib/push/push-navigation-back";
import {
  __setOverlayBackListenerDriverForTests,
  isOverlayBackListenerInstalled,
  setPageBackOwner,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

const HOME = "/";
const LIST = "/community-messenger?section=chats";
const ROOM_B = "/community-messenger/rooms/B";
const ROOM_C = "/community-messenger/rooms/C";

type Entry = { key: string; index: number; path: string };

/** 기록 + Navigation API 흉내 + Chromium 건너뛰기 표시 */
function makeWorld() {
  const entries: Entry[] = [];
  let cur = -1;
  let n = 0;
  const listeners = new Set<(ev?: { navigationType?: string }) => void>();
  /** Chromium 이 「뒤로 UI 에서 건너뛰기」로 표시한 항목(웹이 지울 수 없음) */
  const skippable = new Set<string>();
  const nav = {
    get currentEntry() {
      return entries[cur] ?? null;
    },
    entries: () => entries.map(({ key, index }) => ({ key, index })),
    addEventListener: (_t: string, fn: (ev?: { navigationType?: string }) => void) => listeners.add(fn),
    removeEventListener: (_t: string, fn: (ev?: { navigationType?: string }) => void) => listeners.delete(fn),
  };
  (window as unknown as { navigation: unknown }).navigation = nav;

  let releaseOwner: (() => void) | null = null;
  const router = {
    back: () => window.history.back(),
    replace: (href: string) => {
      entries[cur]!.path = href;
      applyLocation("replace");
    },
  };

  /** 방 셸 마운트 흉내 — 목적지가 replace 일 때만 페이지 뒤로 주인(P5 §B3-5) */
  function syncPageOwner(): void {
    releaseOwner?.();
    releaseOwner = null;
    const path = entries[cur]!.path;
    if (!isCommunityMessengerRoomRoutePathname(path.split("?")[0])) return;
    const resolve = () =>
      resolveMessengerRoomBackTargetNow({
        roomType: "direct",
        listKind: "general",
        searchParams: new URLSearchParams(window.location.search),
      });
    if (resolve().kind !== "replace") return;
    releaseOwner = setPageBackOwner(() => runMessengerRoomBackTarget(router, resolve()));
  }

  function applyLocation(navigationType: string): void {
    window.history.replaceState(null, "", entries[cur]!.path);
    listeners.forEach((fn) => fn({ navigationType }));
    syncPageOwner();
  }

  function push(path: string): void {
    entries.splice(cur + 1);
    entries.push({ key: `k${n++}`, index: entries.length, path });
    cur = entries.length - 1;
    applyLocation("push");
  }

  const world = {
    entries,
    get path() {
      return entries[cur]!.path;
    },
    get index() {
      return cur;
    },
    /** 앱 첫 화면 */
    start(path: string) {
      push(path);
    },
    /** 사용자가 눌러 이동(사용자 활성화 있음) */
    tap(path: string) {
      push(path);
    },
    /** 알림 이동 — PushRouteListener 와 같은 순서(표시 → router.push). 떠난 항목은 Chromium 건너뛰기 */
    notification(path: string) {
      skippable.add(entries[cur]!.key);
      markLeavingByPushNavigation();
      push(path);
    },
    /** history.back() API — 건너뛰기 영향 없음 */
    historyBack() {
      if (cur > 0) cur -= 1;
      applyLocation("traverse");
    },
    /** Android ◁ — 웹 리스너가 있으면 웹(overlay-back-stack), 없으면 WebView 기본 뒤로 */
    pressSystemBack(): "web" | "webview" | "no_back" {
      if (isOverlayBackListenerInstalled()) {
        driverState.onBack?.({ canGoBack: true });
        return "web";
      }
      for (let j = cur - 1; j >= 0; j -= 1) {
        if (!skippable.has(entries[j]!.key)) {
          cur = j;
          applyLocation("traverse");
          return "webview";
        }
      }
      return "no_back";
    },
  };
  return world;
}

const driverState = { onBack: null as null | ((ev: { canGoBack?: boolean }) => void) };
const driver: OverlayBackListenerDriver = {
  install(onBack) {
    driverState.onBack = onBack;
    return () => {
      driverState.onBack = null;
    };
  },
};

let w: ReturnType<typeof makeWorld>;

beforeEach(() => {
  window.sessionStorage.clear();
  __resetMessengerRoomEntryOriginForTests();
  __setOverlayBackListenerDriverForTests(driver);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(window.history, "back").mockImplementation(() => w.historyBack());
  w = makeWorld();
});
afterEach(() => {
  __resetPushNavigationBackForTests();
  __setOverlayBackListenerDriverForTests(null);
  vi.restoreAllMocks();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe("N1 — 설계 4경로", () => {
  it("1. 방 B 보는 중 알림 C → ◁ = 목록 → ◁ = B 가 아닌 목록 이전 화면(HOME)", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C);

    expect(w.pressSystemBack()).toBe("web");
    expect(w.path).toBe(LIST);
    expect(w.index).toBe(2); // replace — 기록 위치 그대로

    expect(w.pressSystemBack()).toBe("webview");
    expect(w.path).not.toBe(ROOM_B);
    expect(w.path).toBe(HOME);
  });

  it("1-변형. 목록 → 방 B → 알림 C → ◁ = 목록 → ◁ = B 가 아님(B 를 연 목록 항목) → ◁ = HOME", () => {
    w.start(HOME);
    w.tap(LIST);
    w.tap(ROOM_B);
    w.notification(ROOM_C);

    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    expect(w.index).toBe(3);

    w.pressSystemBack();
    expect(w.path).not.toBe(ROOM_B);
    expect(w.index).toBe(1); // B 를 열었던 목록 항목(같은 목록 화면) — 실기기 확인 대상
    w.pressSystemBack();
    expect(w.path).toBe(HOME);
  });

  it("2. 목록에서 알림 → ◁ = 목록 → ◁ = HOME", () => {
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C);

    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    expect(w.index).toBe(2);

    expect(w.pressSystemBack()).toBe("webview");
    expect(w.path).toBe(HOME);
    expect(w.index).toBe(0);
  });

  it("3. 콜드(첫 화면에서 바로 알림) → ◁ = 목록 → ◁ = HOME → ◁ = 나감", () => {
    w.start(HOME);
    w.notification(ROOM_C);

    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    // 표시 항목이 첫 기록 — 지우면 canGoBack=false 로 무반응이므로 표시 유지
    expect(isPushNavigationBackActive()).toBe(true);

    expect(w.pressSystemBack()).toBe("web");
    expect(w.path).toBe(HOME);
    expect(isOverlayBackListenerInstalled()).toBe(false);

    expect(w.pressSystemBack()).toBe("no_back"); // 웹 리스너 없음 → Android 가 앱을 닫음
  });

  it("4. 비메신저 화면 알림 진입 ◁ 는 기존과 동일(history.back → 떠난 화면)", () => {
    w.start(HOME);
    w.tap("/stores");
    w.notification("/search");

    expect(isPushNavigationBackActive()).toBe(true);
    expect(w.pressSystemBack()).toBe("web");
    expect(w.path).toBe("/stores");
    expect(w.pressSystemBack()).toBe("webview");
    expect(w.path).toBe(HOME);
  });
});

describe("N1 — 정리 함수 범위", () => {
  it("앱 안 진입 방(in_app)의 ◁ 는 router.back — 표시를 건드리지 않는다", () => {
    w.start(HOME);
    w.tap("/stores");
    w.notification(LIST);
    w.tap(ROOM_B);
    expect(isEntryLeftByPushNavigation(w.entries[1]!.key)).toBe(true);
    // in_app → 페이지 주인 없음, 결함 E 도 아님 → WebView 기본 뒤로
    expect(w.pressSystemBack()).toBe("webview");
    expect(w.path).toBe(LIST);
    expect(isEntryLeftByPushNavigation(w.entries[1]!.key)).toBe(true);
  });

  it("연속 알림(앞 항목도 표시) — 표시를 지우지 않아 지금처럼 history.back", () => {
    w.start(HOME);
    w.notification("/stores");
    w.notification(ROOM_C);
    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    expect(isPushNavigationBackActive()).toBe(true);
    expect(w.pressSystemBack()).toBe("web");
    expect(w.path).toBe("/stores");
  });

  it("Navigation API 없음 — 아무것도 하지 않음(예외 없음)", () => {
    delete (window as unknown as { navigation?: unknown }).navigation;
    expect(() => clearPushNavigationMarkBeforeListReplace()).not.toThrow();
  });

  it("history_back 목적지는 정리 함수를 부르지 않는다(replace 때만)", () => {
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C);
    const markedKey = w.entries[1]!.key;
    const router = { back: vi.fn(), replace: vi.fn() };
    runMessengerRoomBackTarget(router, { kind: "history_back" });
    expect(isEntryLeftByPushNavigation(markedKey)).toBe(true);
    runMessengerRoomBackTarget(router, { kind: "replace", href: LIST });
    expect(isEntryLeftByPushNavigation(markedKey)).toBe(false);
  });
});

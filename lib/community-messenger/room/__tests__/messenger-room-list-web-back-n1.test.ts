// @vitest-environment jsdom
/**
 * N1 (docs/audit/messenger-chat-fix-design-2026-11-18.md PR-2 · 독립 검토 반영 2판) — 알림 진입 방 → ◁ = 목록 →
 * ◁ = 목록 이전 화면. 같은 목록·이전 방이 다시 나오거나 무반응이면 실패.
 *
 * 모델:
 * - 웹 쪽은 실제 모듈(push-navigation-back · overlay-back-stack · messenger-room-back-target · messenger-list-web-back ·
 *   진입 출처 저장소). 방 셸(페이지 뒤로 주인)은 MessengerRoomSwipeBackShell 과 같은 조건으로 흉내.
 * - 알림 이동 직전 화면에 사용자 활성화가 있었는지(`activation`)를 두 경우 모두 시험한다.
 *   없음 → Chromium 이 떠난 항목을 「건너뛰기」로 표시(웹이 지울 수 없고 이후 터치로도 안 풀림 — 11-13 실측).
 *   있음 → 건너뛰기 아님.
 * - Android 기본 뒤로(웹 리스너 없음)는 건너뛰기 아닌 가장 가까운 앞 항목으로. 없으면 첫 기록이면 「나감」, 아니면 「무반응」.
 * - `history.back()`·`navigation.traverseTo()`(웹 호출)는 건너뛰기 영향 없음(11-13 의 history.back 실측. traverseTo 실기 NOT_PROVEN).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMessengerRoomEntryOriginForTests } from "@/lib/community-messenger/room/messenger-room-entry-origin-store";
import {
  resolveMessengerRoomBackTargetNow,
  runMessengerRoomBackTarget,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import {
  __resetMessengerListWebBackForTests,
  MESSENGER_LIST_WEB_BACK_STORAGE_KEY,
} from "@/lib/community-messenger/room/messenger-list-web-back";
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";
import {
  __resetPushNavigationBackForTests,
  isPushNavigationBackActive,
  markLeavingByPushNavigation,
} from "@/lib/push/push-navigation-back";
import {
  __setOverlayBackListenerDriverForTests,
  hasPageBackOwner,
  isOverlayBackListenerInstalled,
  setPageBackOwner,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

const HOME = "/";
const LIST = "/community-messenger?section=chats";
const HUB = "/community-messenger?section=open_chat";
const ROOM_B = "/community-messenger/rooms/B";
const ROOM_C = "/community-messenger/rooms/C";
const ROOM_D = "/community-messenger/rooms/D";
const OPEN_G = "/community-messenger/rooms/G";

type Entry = { key: string; path: string };
type PressResult = "web" | "webview" | "exit" | "no_back";

const driverState = { onBack: null as null | ((ev: { canGoBack?: boolean }) => void) };
const driver: OverlayBackListenerDriver = {
  install(onBack) {
    driverState.onBack = onBack;
    return () => {
      driverState.onBack = null;
    };
  },
};

/**
 * 기록 + Navigation API 흉내.
 * `shellFirst`: 이동 때 방 셸 해제·등록을 currententrychange 보다 먼저(true) 또는 나중(false) — 두 순서 모두 시험.
 */
function makeWorld(opts: { shellFirst?: boolean } = {}) {
  const origin = window.location.origin;
  const entries: Entry[] = [];
  let cur = -1;
  let n = 0;
  const listeners = new Set<(ev?: { navigationType?: string }) => void>();
  const skippable = new Set<string>();
  const traverseCalls: string[] = [];
  const replaceCalls: string[] = [];

  const view = (e: Entry, i: number) => ({ key: e.key, index: i, url: origin + e.path });
  const nav = {
    get currentEntry() {
      const e = entries[cur];
      return e ? view(e, cur) : null;
    },
    entries: () => entries.map(view),
    traverseTo: (key: string) => {
      traverseCalls.push(key);
      const i = entries.findIndex((e) => e.key === key);
      if (i >= 0) {
        cur = i;
        apply("traverse");
      }
      return { committed: Promise.resolve(), finished: Promise.resolve() };
    },
    addEventListener: (_t: string, fn: (ev?: { navigationType?: string }) => void) => listeners.add(fn),
    removeEventListener: (_t: string, fn: (ev?: { navigationType?: string }) => void) => listeners.delete(fn),
  };
  (window as unknown as { navigation: unknown }).navigation = nav;

  let releaseShell: (() => void) | null = null;
  const router = {
    back: () => window.history.back(),
    replace: (href: string) => {
      replaceCalls.push(href);
      entries[cur]!.path = href;
      apply("replace");
    },
  };

  const roomTypeOf = (path: string) => (path.startsWith(OPEN_G) ? "open_group" : "direct");

  /** MessengerRoomSwipeBackShell 흉내: 방 주소에서만, 목적지가 replace 일 때만 페이지 뒤로 주인 */
  function syncShell(): void {
    releaseShell?.();
    releaseShell = null;
    const path = entries[cur]!.path;
    if (!isCommunityMessengerRoomRoutePathname(path.split("?")[0])) return;
    const resolve = () =>
      resolveMessengerRoomBackTargetNow({
        roomType: roomTypeOf(path),
        listKind: "general",
        searchParams: new URLSearchParams(window.location.search),
      });
    if (resolve().kind !== "replace") return;
    releaseShell = setPageBackOwner(() => runMessengerRoomBackTarget(router, resolve()));
  }

  function apply(navigationType: string): void {
    window.history.replaceState(null, "", entries[cur]!.path);
    if (opts.shellFirst) syncShell();
    listeners.forEach((fn) => fn({ navigationType }));
    if (!opts.shellFirst) syncShell();
  }

  function push(path: string): void {
    entries.splice(cur + 1);
    entries.push({ key: `k${n++}`, path });
    cur = entries.length - 1;
    apply("push");
  }

  return {
    entries,
    traverseCalls,
    replaceCalls,
    router,
    get path() {
      return entries[cur]!.path;
    },
    get index() {
      return cur;
    },
    start(path: string) {
      push(path);
    },
    tap(path: string) {
      push(path);
    },
    /** PushRouteListener 와 같은 순서(표시 → router.push). activation 없으면 떠난 항목은 Chromium 건너뛰기 */
    notification(path: string, activation: boolean) {
      if (!activation) skippable.add(entries[cur]!.key);
      markLeavingByPushNavigation();
      push(path);
    },
    historyBack() {
      if (cur > 0) cur -= 1;
      apply("traverse");
    },
    pressSystemBack(): PressResult {
      if (isOverlayBackListenerInstalled()) {
        driverState.onBack?.({ canGoBack: true });
        return "web";
      }
      for (let j = cur - 1; j >= 0; j -= 1) {
        if (!skippable.has(entries[j]!.key)) {
          cur = j;
          apply("traverse");
          return "webview";
        }
      }
      return cur === 0 ? "exit" : "no_back";
    },
  };
}

let w: ReturnType<typeof makeWorld>;

function setup(opts: { shellFirst?: boolean } = {}) {
  w = makeWorld(opts);
}

beforeEach(() => {
  window.sessionStorage.clear();
  __resetMessengerRoomEntryOriginForTests();
  __setOverlayBackListenerDriverForTests(driver);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(window.history, "back").mockImplementation(() => w.historyBack());
  setup();
});
afterEach(() => {
  __resetMessengerListWebBackForTests();
  __resetPushNavigationBackForTests();
  __setOverlayBackListenerDriverForTests(null);
  vi.restoreAllMocks();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

/** ◁ 를 누르며 지나간 화면 — 무반응(no_back)은 즉시 실패 */
function pressPath(): string {
  const r = w.pressSystemBack();
  expect(r).not.toBe("no_back");
  return r === "exit" ? "EXIT" : w.path;
}

describe.each([
  ["활성화 없음", false],
  ["활성화 있음", true],
] as const)("N1 — %s", (_label, activation) => {
  it("1. 방 B 보는 중 알림 C → ◁ = 목록 → ◁ = HOME(B 아님) → ◁ = 나감", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(HOME);
    expect(pressPath()).toBe("EXIT");
  });

  it("2. 목록에서 알림 → ◁ = 목록(같은 기록 항목으로 traverse) → ◁ = HOME → ◁ = 나감", () => {
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(w.index).toBe(1);
    expect(w.replaceCalls).toEqual([]);
    expect(pressPath()).toBe(HOME);
    expect(pressPath()).toBe("EXIT");
  });

  it("3. 목록 → 방 B → 알림 C → ◁ = 목록 → ◁ = HOME(같은 목록·B 아님)", () => {
    w.start(HOME);
    w.tap(LIST);
    w.tap(ROOM_B);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(w.index).toBe(1);
    expect(pressPath()).toBe(HOME);
    expect(pressPath()).toBe("EXIT");
  });

  it("4. 콜드(첫 화면에서 알림) → ◁ = 목록 → ◁ = HOME → ◁ = 나감", () => {
    w.start(HOME);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(HOME);
    expect(pressPath()).toBe("EXIT");
  });

  it("4-첫 기록. 방이 첫 기록 → ◁ = 목록 → ◁ = 나감(웹 담당 없음 — 지금 동작)", () => {
    w.start(ROOM_C);
    expect(pressPath()).toBe(LIST);
    expect(hasPageBackOwner()).toBe(false);
    expect(pressPath()).toBe("EXIT");
  });

  it("5. traverse 이후 알림: HOME → 알림 /stores → ◁ → 목록 탭 → 알림 C → ◁ = 목록 → ◁ = HOME", () => {
    w.start(HOME);
    w.notification("/stores", activation);
    expect(pressPath()).toBe(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(HOME);
    expect(pressPath()).toBe("EXIT");
  });

  it("6. 연속 알림(방 두 개) → ◁ = 목록 → ◁ = HOME", () => {
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_B, activation);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(w.index).toBe(1);
    expect(pressPath()).toBe(HOME);
  });

  it("6-비메신저 사이. HOME → 알림 /stores → 알림 C → ◁ = 목록 → ◁ = /stores → ◁ = HOME", () => {
    w.start(HOME);
    w.notification("/stores", activation);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe("/stores");
    expect(pressPath()).toBe(HOME);
    expect(pressPath()).toBe("EXIT");
  });

  it("7. 비메신저 화면 알림 진입 ◁ 는 지금 동작 그대로(결함 E: history.back → 떠난 화면)", () => {
    w.start(HOME);
    w.tap("/stores");
    w.notification("/search", activation);
    expect(w.pressSystemBack()).toBe("web");
    expect(w.path).toBe("/stores");
    expect(pressPath()).toBe(HOME);
    expect(window.sessionStorage.getItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY)).toBeNull();
  });

  it("8. 오픈 그룹: 모임 허브에서 알림 → ◁ = 허브(traverse) → ◁ = HOME", () => {
    w.start(HOME);
    w.tap(HUB);
    w.notification(OPEN_G, activation);
    expect(pressPath()).toBe(HUB);
    expect(w.index).toBe(1);
    expect(pressPath()).toBe(HOME);
  });

  it("8-다른 목록. 대화 목록에서 오픈 그룹 알림 → ◁ = 허브(replace) → ◁ = 대화 목록(허브·방 아님)", () => {
    w.start(HOME);
    w.tap(LIST);
    w.notification(OPEN_G, activation);
    expect(pressPath()).toBe(HUB);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(HOME);
  });

  it("10. 앱 안 진입(in_app) 방은 지금 동작 그대로(WebView 뒤로, 기록 없음)", () => {
    w.start(HOME);
    w.tap(LIST);
    w.tap(ROOM_B);
    expect(hasPageBackOwner()).toBe(false);
    expect(w.pressSystemBack()).toBe("webview");
    expect(w.path).toBe(LIST);
    expect(window.sessionStorage.getItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY)).toBeNull();
  });
});

describe("N1 — 결함 E 와의 관계·등록 수명", () => {
  it("목록에 결함 E 표시가 남아 있어도(앞 항목 = 이전 방) 페이지 주인이 먼저 처리 → 이전 방으로 가지 않음", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, false);
    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    expect(isPushNavigationBackActive()).toBe(true); // 표시는 그대로(수정 안 함)
    expect(hasPageBackOwner()).toBe(true);
    expect(pressPath()).toBe(HOME);
  });

  it.each([
    ["셸 먼저", true],
    ["이동 이벤트 먼저", false],
  ] as const)("등록 순서(%s) — replace 뒤 목록 담당 등록 1회, 방 셸 해제가 덮지 않음", (_l, shellFirst) => {
    setup({ shellFirst });
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, false);
    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    expect(hasPageBackOwner()).toBe(true);
    expect(pressPath()).toBe(HOME);
  });

  it("목록 → 앱 안 방 D → ◁ → 목록 재방문: 떠날 때 해제, 돌아오면 다시 등록(중복 없음)", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, false);
    w.pressSystemBack(); // 목록(replace)
    expect(hasPageBackOwner()).toBe(true);
    w.tap(ROOM_D);
    expect(hasPageBackOwner()).toBe(false);
    expect(w.pressSystemBack()).toBe("webview");
    expect(w.path).toBe(LIST);
    expect(hasPageBackOwner()).toBe(true);
    expect(pressPath()).toBe(HOME);
    expect(hasPageBackOwner()).toBe(false);
  });
});

describe("N1 — 9. Navigation API 없음", () => {
  it("지금 동작: router.replace 만, 기록·주인 없음", () => {
    delete (window as unknown as { navigation?: unknown }).navigation;
    const router = { back: vi.fn(), replace: vi.fn() };
    runMessengerRoomBackTarget(router, { kind: "replace", href: LIST });
    expect(router.replace).toHaveBeenCalledWith(LIST, { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
    expect(hasPageBackOwner()).toBe(false);
    expect(window.sessionStorage.getItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY)).toBeNull();
  });

  it("traverseTo 없는 Navigation API 도 지금 동작(replace)", () => {
    const nav = (window as unknown as { navigation: Record<string, unknown> }).navigation;
    delete nav.traverseTo;
    const router = { back: vi.fn(), replace: vi.fn() };
    runMessengerRoomBackTarget(router, { kind: "replace", href: LIST });
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});

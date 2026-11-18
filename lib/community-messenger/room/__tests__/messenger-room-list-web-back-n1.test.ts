// @vitest-environment jsdom
/**
 * N1 (docs/audit/messenger-chat-fix-design-2026-11-18.md PR-2 · 구현 기록 docs/audit/messenger-chat-fix-pr2-n1-implementation-2026-11-18.md
 * · 독립 검토 반영 4판) — 알림 진입 방 → ◁ = 목록 →
 * ◁ = 목록 이전 화면. 같은 목록·이전 방이 다시 나오거나 무반응이면 실패.
 *
 * 모델:
 * - 웹 쪽은 실제 모듈(push-navigation-back · overlay-back-stack · messenger-room-back-target · messenger-list-web-back ·
 *   진입 출처 저장소). 방 셸(페이지 뒤로 주인)은 MessengerRoomSwipeBackShell 과 같은 조건으로 흉내.
 * - 알림 이동 직전 화면에 사용자 활성화가 있었는지(`activation`)를 두 경우 모두 시험한다.
 *   없음 → Chromium 이 떠난 항목을 「건너뛰기」로 표시(웹이 지울 수 없고 이후 터치로도 안 풀림 — 11-13 실측).
 *   있음 → 건너뛰기 아님.
 * - Android 기본 뒤로(웹 리스너 없음)는 건너뛰기 아닌 가장 가까운 앞 항목으로. 없으면 첫 기록이면 「나감」, 아니면 「무반응」.
 * - `history.back()`·`history.go()`·`navigation.traverseTo()`(웹 호출)는 건너뛰기 영향 없음
 *   (Chromium `GoToIndex` 는 건너뛰기 미적용 — 소스 기준. 실기 NOT_PROVEN).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMessengerRoomEntryOriginForTests } from "@/lib/community-messenger/room/messenger-room-entry-origin-store";
import {
  resolveMessengerRoomBackTargetNow,
  runMessengerRoomBackTarget,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import {
  __dropMessengerListWebBackMemoryForTests,
  __resetMessengerListWebBackForTests,
  MESSENGER_LIST_WEB_BACK_STORAGE_KEY,
  MESSENGER_LIST_TRAVERSE_CONFIRM_MS,
  restoreMessengerListWebBackAfterReload,
  syncMessengerListWebBack,
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
/** ok: 즉시 이동 · throw: 동기 예외 · reject: committed reject · ignore: 응답 없음(Chromium 무시) · deferred: 늦게 이동 */
type TraverseMode = "ok" | "throw" | "reject" | "ignore" | "deferred";
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
function makeWorld(opts: { shellFirst?: boolean; traverse?: TraverseMode } = {}) {
  const origin = window.location.origin;
  const entries: Entry[] = [];
  let cur = -1;
  let n = 0;
  type Listener = (ev?: { navigationType?: string }) => void;
  const listeners = new Set<{ type: string; fn: Listener }>();
  const fire = (type: string, navigationType: string) =>
    [...listeners].filter((l) => l.type === type).forEach((l) => l.fn({ navigationType }));
  let pendingTraverse: string | null = null;
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
      if (opts.traverse === "throw") throw new Error("InvalidStateError");
      if (opts.traverse === "reject") {
        return { committed: Promise.reject(new Error("AbortError")), finished: Promise.reject(new Error("AbortError")) };
      }
      if (opts.traverse === "ignore" || opts.traverse === "deferred") {
        if (opts.traverse === "deferred") pendingTraverse = key;
        const never = new Promise<void>(() => {});
        return { committed: never, finished: never };
      }
      const i = entries.findIndex((e) => e.key === key);
      if (i >= 0) {
        cur = i;
        apply("traverse");
      }
      return { committed: Promise.resolve(), finished: Promise.resolve() };
    },
    addEventListener: (type: string, fn: Listener) => {
      listeners.add({ type, fn });
    },
    removeEventListener: (type: string, fn: Listener) => {
      for (const l of listeners) if (l.type === type && l.fn === fn) listeners.delete(l);
    },
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
    fire("navigate", navigationType);
    window.history.replaceState(null, "", entries[cur]!.path);
    if (opts.shellFirst) syncShell();
    fire("currententrychange", navigationType);
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
    /** deferred: 늦게 도착한 traverse 를 이제 반영 */
    completePendingTraverse() {
      const i = entries.findIndex((e) => e.key === pendingTraverse);
      pendingTraverse = null;
      if (i >= 0) {
        cur = i;
        apply("traverse");
      }
    },
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
    historyGo(delta: number) {
      const next = cur + delta;
      if (next >= 0 && next < entries.length) {
        cur = next;
        apply("traverse");
      }
    },
    /** 문서 reload 흉내 — 메모리 상태(방 셸·목록 담당 구독·주인)만 사라지고 sessionStorage·기록은 남는다. */
    reload(restore = true) {
      releaseShell?.();
      releaseShell = null;
      __dropMessengerListWebBackMemoryForTests();
      if (restore) restoreMessengerListWebBackAfterReload();
      syncShell();
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

function setup(opts: { shellFirst?: boolean; traverse?: TraverseMode } = {}) {
  w = makeWorld(opts);
}

beforeEach(() => {
  window.sessionStorage.clear();
  __resetMessengerRoomEntryOriginForTests();
  __setOverlayBackListenerDriverForTests(driver);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(window.history, "back").mockImplementation(() => w.historyBack());
  vi.spyOn(window.history, "go").mockImplementation((d?: number) => w.historyGo(d ?? 0));
  setup();
});
afterEach(() => {
  __resetMessengerListWebBackForTests();
  __resetPushNavigationBackForTests();
  __setOverlayBackListenerDriverForTests(null);
  vi.restoreAllMocks();
  delete (window as unknown as { navigation?: unknown }).navigation;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
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

describe.each([
  ["활성화 없음", false],
  ["활성화 있음", true],
] as const)("D1 — 문서 reload 뒤 (%s)", (_l, activation) => {
  it("방 B → 알림 C → ◁ = 목록 → reload → ◁ = HOME(B 아님)", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    w.reload();
    expect(hasPageBackOwner()).toBe(true);
    expect(pressPath()).toBe(HOME);
  });

  it("reload 뒤 다른 화면에서 ◁ 로 목록에 돌아와도 담당 → ◁ = HOME", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    w.tap("/stores");
    w.reload();
    expect(hasPageBackOwner()).toBe(false);
    expect(pressPath()).toBe(LIST);
    expect(hasPageBackOwner()).toBe(true);
    expect(pressPath()).toBe(HOME);
  });

  it("(대조) 복원을 부르지 않으면 결함 E 가 ◁ 를 B 로 보낸다 — 복원이 필요한 이유", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, activation);
    w.pressSystemBack();
    w.reload(false);
    expect(hasPageBackOwner()).toBe(false);
    w.pressSystemBack();
    expect(w.path).toBe(ROOM_B);
  });
});

describe.each([
  ["활성화 없음", false],
  ["활성화 있음", true],
] as const)("D2 — 앱 안에서 들른 방은 건너뛰지 않음 (%s)", (_l, activation) => {
  it("traverse 도착: HOME → 방 X → 목록 → 알림 C → ◁ = 목록 → ◁ = X", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.tap(LIST);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(w.index).toBe(2);
    expect(pressPath()).toBe(ROOM_B);
  });

  it("replace 도착: HOME → 방 X → (앱 안) 방 Y → 알림 C → ◁ = 목록 → ◁ = X(알림 직전 방 Y 만 건너뜀)", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.tap(ROOM_D);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(ROOM_B);
  });

  it("replace 도착: 알림으로 열린 방 사이(B → 알림 D → 알림 C) 는 모두 건너뜀 → HOME", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_D, activation);
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(HOME);
  });
});

describe("D3 — traverseTo 실패 시 대체 이동(무반응 없음)", () => {
  it("동기 예외: 방 ◁ = 목록 replace, 목록 ◁ = history.go 로 HOME", () => {
    setup({ traverse: "throw" });
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, false);
    expect(pressPath()).toBe(LIST);
    expect(w.index).toBe(2); // traverse 실패 → replace
    expect(pressPath()).toBe(HOME);
  });

  it("committed reject: 아직 방이면 목록 replace 로 대체", async () => {
    setup({ traverse: "reject" });
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, false);
    expect(w.pressSystemBack()).toBe("web");
    await Promise.resolve();
    await Promise.resolve();
    expect(w.path).toBe(LIST);
    expect(w.replaceCalls).toEqual([LIST]);
  });

  it("목록 ◁ 의 committed reject → history.go 로 대체", async () => {
    setup({ traverse: "reject" });
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, false);
    w.pressSystemBack(); // replace 도착
    expect(w.path).toBe(LIST);
    w.pressSystemBack();
    await Promise.resolve();
    await Promise.resolve();
    expect(w.path).toBe(HOME);
  });
});

describe("D5 — iOS 앱은 지금 동작(replace 만, 새 이동·담당 없음)", () => {
  it("앞쪽에 같은 목록이 있어도 replace, 기록·주인 없음, 복원도 아무것도 안 함", () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { getPlatform: () => "ios" };
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, false);
    const router = { back: vi.fn(), replace: vi.fn() };
    runMessengerRoomBackTarget(router, { kind: "replace", href: LIST });
    expect(router.replace).toHaveBeenCalledWith(LIST, { scroll: false });
    expect(w.traverseCalls).toEqual([]);
    expect(window.sessionStorage.getItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY)).toBeNull();
    restoreMessengerListWebBackAfterReload();
    expect(hasPageBackOwner()).toBe(true); // 방 셸 주인(지금 동작) — 목록 담당 아님
  });
});

describe.each([
  ["활성화 없음", false],
  ["활성화 있음", true],
] as const)("검토 4판 1 — 알림 때 보던 방 아닌 화면을 건너뛰지 않음 (%s)", (_l, activation) => {
  it("(가) HOME → 목록 → /stores(앱 안) → 알림 C → ◁ = 목록 → ◁ = /stores → ◁ = 목록 → ◁ = HOME", () => {
    w.start(HOME);
    w.tap(LIST);
    w.tap("/stores");
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe("/stores");
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe(HOME);
  });

  it("(나) 목록 → 방 B → /products/1 → 알림 C → ◁ = 목록 → ◁ = /products/1", () => {
    w.start(HOME);
    w.tap(LIST);
    w.tap(ROOM_B);
    w.tap("/products/1");
    w.notification(ROOM_C, activation);
    expect(pressPath()).toBe(LIST);
    expect(pressPath()).toBe("/products/1");
  });
});

describe("검토 4판 2 — 슬롯 경합: 덮기 → 해제 → 다시 등록", () => {
  it("다른 주인이 목록 담당을 덮었다가 해제하면 sync 로 다시 등록되고 ◁ = HOME", () => {
    w.start(HOME);
    w.tap(ROOM_B);
    w.notification(ROOM_C, false);
    w.pressSystemBack();
    expect(w.path).toBe(LIST);
    const other = vi.fn();
    const releaseOther = setPageBackOwner(other);
    releaseOther();
    expect(hasPageBackOwner()).toBe(false);
    syncMessengerListWebBack(); // 방 셸은 해제 직후 이 함수를 부른다
    expect(hasPageBackOwner()).toBe(true);
    expect(pressPath()).toBe(HOME);
    expect(other).not.toHaveBeenCalled();
  });
});

describe("검토 4판 3 — traverseTo 무응답(Chromium 무시)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("방 ◁: 확인 시간 뒤 router.replace 1회, 목록 ◁: 확인 시간 뒤 history.go 1회 — 무반응 없음", async () => {
    setup({ traverse: "ignore" });
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, false);
    expect(w.pressSystemBack()).toBe("web");
    expect(w.path).toBe(ROOM_C);
    await vi.advanceTimersByTimeAsync(MESSENGER_LIST_TRAVERSE_CONFIRM_MS);
    expect(w.replaceCalls).toEqual([LIST]);
    expect(w.path).toBe(LIST);
    expect(w.pressSystemBack()).toBe("web");
    await vi.advanceTimersByTimeAsync(MESSENGER_LIST_TRAVERSE_CONFIRM_MS);
    expect(w.path).toBe(HOME);
    await vi.advanceTimersByTimeAsync(MESSENGER_LIST_TRAVERSE_CONFIRM_MS * 3);
    expect(w.replaceCalls).toEqual([LIST]);
    expect(w.path).toBe(HOME);
  });

  it("늦게라도 이동이 시작되면 대체 이동 없음(이중 이동 방지)", async () => {
    setup({ traverse: "deferred" });
    w.start(HOME);
    w.tap(LIST);
    w.notification(ROOM_C, false);
    w.pressSystemBack();
    await vi.advanceTimersByTimeAsync(MESSENGER_LIST_TRAVERSE_CONFIRM_MS - 1);
    w.completePendingTraverse();
    expect(w.path).toBe(LIST);
    await vi.advanceTimersByTimeAsync(MESSENGER_LIST_TRAVERSE_CONFIRM_MS * 3);
    expect(w.replaceCalls).toEqual([]);
    expect(w.path).toBe(LIST);
    expect(w.index).toBe(1);
  });
});

// @vitest-environment jsdom
/**
 * D1·F4 — Android 첫 화면 ◁ (감사 docs/audit/android-system-nav-2026-11-17/README.md).
 * 하단 탭 첫 화면 ◁ = 시작 탭(HOME)으로 · 시작 탭 첫 화면 ◁ = 앱 내리기 · 그 밖의 화면은 손대지 않음.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAndroidRootBackForTests,
  markBottomNavTabRootEntry,
  registerRootBackTabBar,
  resolveCurrentRootTab,
  startAndroidRootBackTracking,
} from "@/lib/ui/android-root-back";
import {
  __setOverlayBackListenerDriverForTests,
  isOverlayBackListenerInstalled,
} from "@/lib/ui/overlay-back-stack";

/** 탭 이동 = replace(같은 key), 링크 이동 = push(새 key). */
function fakeHistory(firstPath: string) {
  const listeners = new Set<() => void>();
  const entries: Array<{ key: string; path: string }> = [{ key: "k0", path: firstPath }];
  let idx = 0;
  let n = 1;
  const nav = {
    get currentEntry() {
      return { index: idx, key: entries[idx]!.key };
    },
    addEventListener: (_t: "currententrychange", fn: () => void) => listeners.add(fn),
    removeEventListener: (_t: "currententrychange", fn: () => void) => listeners.delete(fn),
  };
  const fire = () => {
    for (const fn of [...listeners]) fn();
  };
  return {
    nav,
    listeners,
    path: () => entries[idx]!.path,
    push(path: string) {
      entries.splice(idx + 1);
      entries.push({ key: `k${n++}`, path });
      idx = entries.length - 1;
      fire();
    },
    replace(path: string) {
      entries[idx] = { key: entries[idx]!.key, path };
      fire();
    },
    back() {
      idx -= 1;
      fire();
    },
  };
}

const TABS = [
  { tabId: "home", path: "/home" },
  { tabId: "community", path: "/philife" },
  { tabId: "delivery", path: "/stores" },
  { tabId: "chat", path: "/community-messenger" },
  { tabId: "my", path: "/mypage" },
];

let state: { minimizes: number; onBack: null | ((ev: { canGoBack?: boolean }) => void) };
let goStartTab: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetAndroidRootBackForTests();
  state = { minimizes: 0, onBack: null };
  __setOverlayBackListenerDriverForTests({
    install(onBack) {
      state.onBack = onBack;
      return () => {
        state.onBack = null;
      };
    },
    minimize() {
      state.minimizes += 1;
    },
  });
  goStartTab = vi.fn(() => true);
});

afterEach(() => {
  __resetAndroidRootBackForTests();
  __setOverlayBackListenerDriverForTests(null);
});

function start(h: ReturnType<typeof fakeHistory>, withBar = true) {
  if (withBar) registerRootBackTabBar({ startTabId: "home", tabRootPaths: TABS, goStartTab });
  return startAndroidRootBackTracking({ platform: "android", nav: h.nav, pathname: h.path });
}

describe("android-root-back", () => {
  it("앱 첫 화면 `/`(HOME) → ◁ = 앱 내리기", () => {
    const h = fakeHistory("/");
    start(h);
    expect(resolveCurrentRootTab()).toBe("home");
    state.onBack?.({ canGoBack: false });
    expect(state.minimizes).toBe(1);
    expect(goStartTab).not.toHaveBeenCalled();
  });

  it("탭으로 LOUNGE 이동(남은 기록 있음) → ◁ = HOME 탭 누르기, HOME 에서 ◁ = 앱 내리기 (실측 D4 경로)", () => {
    const h = fakeHistory("/philife");
    start(h);
    h.push("/moim"); // 화면 안 이동(push)
    expect(isOverlayBackListenerInstalled()).toBe(false); // 일반 화면 = 손대지 않음
    h.replace("/stores"); // DIPICK 탭 이동(replace)
    markBottomNavTabRootEntry("delivery");
    expect(resolveCurrentRootTab()).toBe("delivery");
    state.onBack?.({ canGoBack: true });
    expect(goStartTab).toHaveBeenCalledTimes(1);
    expect(state.minimizes).toBe(0);
    h.replace("/home"); // 시작 탭 버튼이 한 이동
    markBottomNavTabRootEntry("home");
    state.onBack?.({ canGoBack: true });
    expect(state.minimizes).toBe(1);
  });

  it("화면 안 링크로 같은 주소에 들어오면 첫 화면이 아니다 → 이전 화면(손대지 않음)", () => {
    const h = fakeHistory("/home");
    start(h);
    h.push("/community-messenger/rooms/r1");
    h.push("/mypage"); // 채팅방 → 내정보 링크
    expect(resolveCurrentRootTab()).toBeNull();
    expect(isOverlayBackListenerInstalled()).toBe(false);
  });

  it("탭 첫 화면 표시는 그 항목에만 — 하위 화면으로 가면 꺼지고 돌아오면 다시 켜진다", () => {
    const h = fakeHistory("/home");
    start(h);
    h.replace("/mypage");
    markBottomNavTabRootEntry("my");
    h.push("/mypage/trust");
    expect(isOverlayBackListenerInstalled()).toBe(false);
    h.back();
    expect(resolveCurrentRootTab()).toBe("my");
    expect(isOverlayBackListenerInstalled()).toBe(true);
  });

  it("탭 안에서 주소만 바뀌는 replace(telRING 친구·통화) 는 같은 첫 화면", () => {
    const h = fakeHistory("/home");
    start(h);
    h.replace("/community-messenger?section=chats");
    markBottomNavTabRootEntry("chat");
    h.replace("/community-messenger?section=friends");
    expect(resolveCurrentRootTab()).toBe("chat");
  });

  it("앱 첫 항목이 탭 주소가 아니면(알림으로 상세 진입 등) ◁ = 앱 내리기", () => {
    const h = fakeHistory("/post/abc");
    start(h);
    expect(resolveCurrentRootTab()).toBe("");
    state.onBack?.({ canGoBack: false });
    expect(state.minimizes).toBe(1);
  });

  it("하단 탭 막대가 없으면 시작 탭으로 갈 수 없음 → 앱 내리기", () => {
    const h = fakeHistory("/philife");
    start(h, false);
    state.onBack?.({ canGoBack: false });
    expect(state.minimizes).toBe(1);
    expect(goStartTab).not.toHaveBeenCalled();
  });

  it("다시 연 문서에서도 탭 첫 화면 표시를 기억한다(sessionStorage)", () => {
    const h = fakeHistory("/home");
    const stop = start(h);
    h.push("/x");
    h.replace("/philife");
    markBottomNavTabRootEntry("community");
    stop();
    const h2 = fakeHistory("/home");
    h2.push("/x"); // 같은 key k1
    start(h2);
    expect(resolveCurrentRootTab()).toBe("community");
  });

  it("Android 가 아니거나 Navigation API 가 없으면 아무것도 하지 않는다", () => {
    for (const platform of ["ios", "web", "windows"]) {
      const h = fakeHistory("/");
      startAndroidRootBackTracking({ platform, nav: h.nav, pathname: h.path })();
      expect(h.listeners.size).toBe(0);
    }
    startAndroidRootBackTracking({ platform: "android", nav: null })();
    expect(isOverlayBackListenerInstalled()).toBe(false);
  });

  it("공급자 트리 1곳 장착 · 하단 탭 커밋이 실제 이동 때만 표시 · 막대가 시작 탭을 등록", () => {
    const tree = readFileSync("components/layout/MainAppProviderTree.tsx", "utf8");
    expect(tree.match(/<AndroidRootBackHost \/>/g)?.length).toBe(1);
    const bar = readFileSync("components/layout/BottomNav.tsx", "utf8");
    expect(bar).toContain('if (result === "navigated") markBottomNavTabRootEntry(opts.tabId);');
    expect(bar).toContain("registerRootBackTabBar({");
    expect(bar).toContain("const startTabId = displayTabs[0]?.id ?? null;");
  });
});

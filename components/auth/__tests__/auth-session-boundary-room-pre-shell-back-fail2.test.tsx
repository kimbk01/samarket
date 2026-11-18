// @vitest-environment jsdom
/**
 * FAIL-2 (docs/audit/messenger-chat-fail2-fail3-call-impact-analysis-2026-11-18.md §2) — 앱이 꺼진 상태에서 알림으로 방 주소가
 * 열린 뒤 세션 확인 전 「차단」 화면(방 셸 없음) 동안의 Android ◁ 주인. 실제 `AuthSessionBoundary` + 실제 방 셸을 렌더한다.
 */
import { act, Suspense, use, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  pathname: "/community-messenger/rooms/room-1",
  authenticated: false,
  entryOrigin: "push" as "push" | "in_app" | "first_entry",
  membership: { status: "checking" } as Record<string, unknown>,
  authExit: false,
  /** 마지막 console.info 라벨 — 주인 등록이 셸(`page_back_owner`)인지 차단 화면 요소(`pre_shell_page_back_owner`)인지 */
  lastInfo: "",
  /** 지금 ◁ 칸 주인의 등록 라벨(없으면 null) */
  ownerTag: null as string | null,
}));
const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => state.pathname,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-client-membership-state", () => ({ useClientMembershipState: () => state.membership }));
vi.mock("@/lib/auth/auth-exit-coordinator", () => ({
  isAuthExitNavigateStarted: () => state.authExit,
  runAuthAccountSwitchExit: vi.fn(),
  runAuthRequiredExit: vi.fn(),
  runAuthSessionExpiredExit: vi.fn(),
}));
vi.mock("@/lib/auth/reset-auth-state", () => ({ exposeResetAuthStateForDev: () => {} }));
vi.mock("@/lib/auth/dibay-session-manager", () => ({ getSessionPhase: () => "hydrating" }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));
vi.mock("@/lib/community-messenger/room/messenger-room-entry-origin-store", () => ({
  resolveMessengerRoomEntryOrigin: () => state.entryOrigin,
}));
vi.mock("@/hooks/use-is-messenger-split-viewport", () => ({ useIsMessengerSplitViewport: () => false }));
/** 실제 칸 그대로 — 등록마다 누가 등록했는지(직전 console.info 라벨)만 기록 */
vi.mock("@/lib/ui/overlay-back-stack", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ui/overlay-back-stack")>();
  return {
    ...real,
    setPageBackOwner: (owner: (() => void) | null) => {
      const release = real.setPageBackOwner(owner);
      state.ownerTag = owner ? state.lastInfo : null;
      return () => {
        release();
        if (!real.hasPageBackOwner()) state.ownerTag = null;
      };
    },
  };
});

import { AuthSessionBoundary } from "@/components/auth/AuthSessionBoundary";
import { MessengerRoomSwipeBackShell } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { clearAuthSessionClientCache } from "@/lib/auth/fetch-auth-session-client";
import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import { buildMissedCallWebPath } from "@/lib/notifications/policy/notification-deeplink-paths";
import {
  __setOverlayBackListenerDriverForTests,
  hasPageBackOwner,
  setPushNavigationBackActive,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

const CHATS_LIST = "/community-messenger?section=chats";

const driverState = {
  onBack: null as null | ((ev: { canGoBack?: boolean }) => void),
  installs: 0,
  removes: 0,
};
const driver: OverlayBackListenerDriver = {
  install(onBack) {
    driverState.installs += 1;
    driverState.onBack = onBack;
    return () => {
      driverState.removes += 1;
      driverState.onBack = null;
    };
  },
};

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ authenticated: state.authenticated }),
}));

let container: HTMLDivElement;
let root: Root;
let childMounts = 0;

function MountCounter({ children }: { children?: ReactNode }) {
  useEffect(() => {
    childMounts += 1;
  }, []);
  return <>{children}</>;
}

const SHELL_TAG = "[cm-room-back] page_back_owner";
const PRE_SHELL_TAG = "[cm-room-back] pre_shell_page_back_owner";

/** 방 세그먼트 `loading.tsx`(Suspense) 흉내 — done 전에는 셸 대신 fallback */
const suspended = { done: true, promise: Promise.resolve(), resolve: () => {} };
function armSuspense() {
  suspended.done = false;
  suspended.promise = new Promise<void>((r) => {
    suspended.resolve = () => {
      suspended.done = true;
      r();
    };
  });
}
function SegmentGate({ children }: { children: ReactNode }) {
  if (!suspended.done) use(suspended.promise);
  return <>{children}</>;
}

/** 앱 화면 트리 대신 — 방 경로면 방 셸(실제), 통화 경로면 통화 자리, 그 밖이면 목록 자리 */
function RoomTree() {
  return (
    <MountCounter>
      {state.pathname.startsWith("/community-messenger/rooms/") ? (
        <Suspense fallback={<div data-testid="room-loading" />}>
          <SegmentGate>
            <MessengerRoomSwipeBackShell roomId="room-1" roomType={null}>
              <div data-testid="room-body" />
            </MessengerRoomSwipeBackShell>
          </SegmentGate>
        </Suspense>
      ) : state.pathname.startsWith("/community-messenger/calls/") ? (
        <div data-testid="call" />
      ) : (
        <div data-testid="list" />
      )}
    </MountCounter>
  );
}

async function renderBoundary(path: string, children: ReactNode = <RoomTree />) {
  state.pathname = path;
  window.history.replaceState(null, "", path);
  await act(async () => {
    root.render(<AuthSessionBoundary>{children}</AuthSessionBoundary>);
  });
}

/** 세션 확인이 「로그인됨」으로 끝나 차단이 풀린다(다음 1초 확인) */
async function unblock() {
  state.authenticated = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

function pressSystemBack() {
  act(() => {
    driverState.onBack?.({ canGoBack: true });
  });
}

function blockedScreen(): Element | null {
  return container.querySelector("[data-auth-session-boundary=blocked]");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  clearAuthSessionClientCache();
  router.back.mockReset();
  router.replace.mockReset();
  state.authenticated = false;
  state.entryOrigin = "push";
  state.membership = { status: "checking" };
  state.authExit = false;
  state.lastInfo = "";
  state.ownerTag = null;
  suspended.done = true;
  childMounts = 0;
  driverState.installs = 0;
  driverState.removes = 0;
  driverState.onBack = null;
  __setOverlayBackListenerDriverForTests(driver);
  vi.spyOn(console, "info").mockImplementation((label?: unknown) => {
    state.lastInfo = String(label ?? "");
  });
  /** 움직임 줄이기 — 셸 ◁ 가 애니메이션 없이 바로 이동(목적지만 본다) */
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  __setOverlayBackListenerDriverForTests(null);
  clearAuthSessionClientCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FAIL-2 — 차단 화면(세션 확인 전) ◁", () => {
  it("방 경로 + 알림 진입(push) → 주인 등록, ◁ = 대화 목록 replace 1회(HOME 아님)", async () => {
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(blockedScreen()).not.toBeNull();
    expect(container.querySelector("[data-testid=room-body]")).toBeNull();
    expect(hasPageBackOwner()).toBe(true);
    expect(driverState.installs).toBe(1);
    pressSystemBack();
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(CHATS_LIST, { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
  });

  it("결함 E(알림 이동 직후)가 켜져 있어도 주인이 먼저 — history.back 없음", async () => {
    setPushNavigationBackActive(true);
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await renderBoundary("/community-messenger/rooms/room-1");
    pressSystemBack();
    expect(historyBack).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(CHATS_LIST, { scroll: false });
  });

  it("방 경로 + URL cm_list → cm_list 목록 replace(셸과 같은 규칙)", async () => {
    await renderBoundary("/community-messenger/rooms/room-1?cm_list=trade");
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      buildMessengerRoomListBackHref(new URLSearchParams("cm_list=trade")),
      { scroll: false }
    );
  });

  it("부재중 통화 알림 경로(방 경로) → 같은 동작(◁ = 대화 목록 replace 1회)", async () => {
    const missed = buildMissedCallWebPath("room-1", "call-1");
    expect(missed.startsWith("/community-messenger/rooms/")).toBe(true);
    await renderBoundary(missed);
    expect(blockedScreen()).not.toBeNull();
    expect(hasPageBackOwner()).toBe(true);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(CHATS_LIST, { scroll: false });
  });

  it("통화 경로 → 주인 미등록(지금과 같음)", async () => {
    await renderBoundary("/community-messenger/calls/call-1", <div data-testid="call" />);
    expect(blockedScreen()).not.toBeNull();
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.installs).toBe(0);
  });

  it("그 밖 경로(차단 대상) → 주인 미등록", async () => {
    await renderBoundary("/chats/abc", <div data-testid="other" />);
    expect(blockedScreen()).not.toBeNull();
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.installs).toBe(0);
  });

  it("앱 안 진입(in_app) → 셸 규칙과 같게 미등록(◁ = WebView 기본 뒤로)", async () => {
    state.entryOrigin = "in_app";
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(blockedScreen()).not.toBeNull();
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.installs).toBe(0);
    pressSystemBack();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("FAIL-2 — 차단 해제 → 방 셸로 넘김(공백·재설치 없음)", () => {
  it("push: 차단 중 등록 → 해제 = 셸 등록, install 1·remove 0, ◁ 1회 = 대화 목록 replace", async () => {
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(state.ownerTag).toBe(PRE_SHELL_TAG);
    expect(driverState.installs).toBe(1);
    await unblock();
    expect(blockedScreen()).toBeNull();
    expect(container.querySelector("[data-testid=room-body]")).not.toBeNull();
    expect(state.ownerTag).toBe(SHELL_TAG);
    expect(hasPageBackOwner()).toBe(true);
    expect(driverState.installs).toBe(1);
    expect(driverState.removes).toBe(0);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(CHATS_LIST, { scroll: false });
  });

  it("in_app: 차단 중·해제 뒤 모두 미등록(install 0)", async () => {
    state.entryOrigin = "in_app";
    await renderBoundary("/community-messenger/rooms/room-1");
    await unblock();
    expect(container.querySelector("[data-testid=room-body]")).not.toBeNull();
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.installs).toBe(0);
  });

  it("해제 뒤 방을 떠나면(목록 경로) 주인 해제 · 화면 트리는 다시 마운트되지 않음", async () => {
    clearAuthSessionClientCache();
    await renderBoundary("/community-messenger/rooms/room-1");
    await unblock();
    expect(childMounts).toBe(1);
    await renderBoundary("/community-messenger");
    expect(container.querySelector("[data-testid=list]")).not.toBeNull();
    expect(childMounts).toBe(1);
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.removes).toBe(1);
  });
});

describe("FAIL-2 감사 1 — 차단 해제 때 방 세그먼트가 아직 로딩(Suspense, 셸 없음)", () => {
  it("해제 + 셸 suspend → 차단 화면 요소가 계속 주인 → ◁ = 목록 1회 → 셸 마운트 → 칸이 셸로, install 1·remove 0", async () => {
    armSuspense();
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(state.ownerTag).toBe(PRE_SHELL_TAG);
    await unblock();
    expect(blockedScreen()).toBeNull();
    expect(container.querySelector("[data-testid=room-loading]")).not.toBeNull();
    expect(container.querySelector("[data-testid=room-body]")).toBeNull();
    expect(state.ownerTag).toBe(PRE_SHELL_TAG);
    expect(driverState.installs).toBe(1);
    expect(driverState.removes).toBe(0);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(CHATS_LIST, { scroll: false });

    router.replace.mockReset();
    await act(async () => {
      suspended.resolve();
      await suspended.promise;
    });
    expect(container.querySelector("[data-testid=room-body]")).not.toBeNull();
    expect(state.ownerTag).toBe(SHELL_TAG);
    expect(driverState.installs).toBe(1);
    expect(driverState.removes).toBe(0);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(CHATS_LIST, { scroll: false });
  });
});

describe("FAIL-2 감사 2 — 인증 종료로 다시 차단", () => {
  it("해제 뒤(셸 주인) 인증 종료 → 재차단: 주인 없음, ◁ replace 0", async () => {
    await renderBoundary("/community-messenger/rooms/room-1");
    await unblock();
    expect(state.ownerTag).toBe(SHELL_TAG);
    state.authExit = true;
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(blockedScreen()).not.toBeNull();
    expect(hasPageBackOwner()).toBe(false);
    pressSystemBack();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("차단 중(요소 주인) 인증 종료 → 요소 해제: 주인 없음, ◁ replace 0", async () => {
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(state.ownerTag).toBe(PRE_SHELL_TAG);
    state.authExit = true;
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(hasPageBackOwner()).toBe(false);
    pressSystemBack();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("FAIL-2 감사 3 — 이동 1회 표시는 주소가 바뀌면 다시 열림", () => {
  it("◁ 1회 뒤 같은 요소에서 주소가 다른 방으로 바뀌면 ◁ 가 다시 이동", async () => {
    await renderBoundary("/community-messenger/rooms/room-1");
    pressSystemBack();
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    await renderBoundary("/community-messenger/rooms/room-2");
    expect(blockedScreen()).not.toBeNull();
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(2);
  });
});

describe("FAIL-2 감사 4 — 통화 경로 화면 트리 정체성(main 과 같음)", () => {
  it("A: 통화 경로(세션 확인됨) → 방 경로 → 목록 경로 이동에도 화면 트리 마운트 1회, 통화 경로에서 주인 없음", async () => {
    clearAuthSessionClientCache();
    await renderBoundary("/community-messenger/calls/call-1");
    await unblock();
    expect(container.querySelector("[data-testid=call]")).not.toBeNull();
    expect(childMounts).toBe(1);
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.installs).toBe(0);
    await renderBoundary("/community-messenger/rooms/room-1");
    expect(container.querySelector("[data-testid=room-body]")).not.toBeNull();
    expect(childMounts).toBe(1);
    await renderBoundary("/community-messenger");
    expect(childMounts).toBe(1);
  });

  it("B: 통화 경로 회원 확인(최종 반환) → 세션 확인(통화 분기) 전환에도 화면 트리 마운트 1회, 주인 없음", async () => {
    state.membership = { status: "member", profile: { id: "u1" } };
    await renderBoundary("/community-messenger/calls/call-1");
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid=call]")).not.toBeNull();
    expect(childMounts).toBe(1);
    expect(hasPageBackOwner()).toBe(false);
    expect(driverState.installs).toBe(0);
  });
});

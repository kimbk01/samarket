// @vitest-environment jsdom
/**
 * 요청 증폭 근본 수정 2단계 2-C — 「로그인됨」 확인 뒤에는 /api/auth/session 1초 반복을 멈춘다.
 * 확인 전 동작(1초마다 확인)과 화면 판정은 그대로다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false, membership: { status: "checking" } as Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/community-messenger/rooms/r1",
  // 앱 진입 SSOT C2: 방 경로 차단 화면 = 방 틀(MessengerSplitRoomEntryFrame — useParams 사용)
  useParams: () => ({}),
  // FAIL-2: 방 경로 차단 화면에 ◁ 주인 요소가 함께 그려진다(useRouter 사용)
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-is-messenger-split-viewport", () => ({ useIsMessengerSplitViewport: () => false }));
vi.mock("@/hooks/use-client-membership-state", () => ({ useClientMembershipState: () => state.membership }));
vi.mock("@/lib/auth/auth-route-classification", () => ({ isAccountDependentPath: () => true }));
vi.mock("@/lib/auth/auth-exit-coordinator", () => ({
  isAuthExitNavigateStarted: () => false,
  runAuthAccountSwitchExit: vi.fn(),
  runAuthRequiredExit: vi.fn(),
  runAuthSessionExpiredExit: vi.fn(),
}));
vi.mock("@/lib/auth/reset-auth-state", () => ({ exposeResetAuthStateForDev: () => {} }));
vi.mock("@/lib/auth/dibay-session-manager", () => ({ getSessionPhase: () => "hydrating" }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ authenticated: state.authenticated }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderAndAdvance(ms: number) {
  const { AuthSessionBoundary } = await import("@/components/auth/AuthSessionBoundary");
  await act(async () => {
    root.render(
      <AuthSessionBoundary>
        <div data-testid="child" />
      </AuthSessionBoundary>
    );
  });
  for (let i = 0; i < ms / 1000; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

describe("AuthSessionBoundary 세션 확인 반복", () => {
  it("확인 전(미인증 응답)에는 지금처럼 1초마다 확인한다", async () => {
    state.authenticated = false;
    await renderAndAdvance(5000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("세션 API 가 로그인됨을 돌려주면 반복을 멈추고 화면을 연다", async () => {
    state.authenticated = true;
    await renderAndAdvance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid=child]")).not.toBeNull();
  });
});

describe("설계 §24 D5 — 로그인 확인 결과 공유 (Auth HARD LOCK Amendment 2026-11-18)", () => {
  it("다른 확인이 3초 안에 「로그인됨」을 남겼으면 요청 없이 화면을 연다", async () => {
    const cache = await import("@/lib/auth/fetch-auth-session-client");
    cache.clearAuthSessionClientCache();
    cache.noteAuthSessionClientOk();
    state.authenticated = false; // 요청이 나가면 미인증 — 요청 없이 열려야 통과
    await renderAndAdvance(0);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=child]")).not.toBeNull();
    cache.clearAuthSessionClientCache();
  });

  it("직접 확인이 「로그인됨」이면 공용 캐시에 남긴다 · 미인증이면 남기지 않는다", async () => {
    const cache = await import("@/lib/auth/fetch-auth-session-client");
    cache.clearAuthSessionClientCache();
    state.authenticated = false;
    await renderAndAdvance(1000);
    expect(cache.peekAuthSessionClientOk()).toBe(false);
    act(() => root.unmount());
    root = createRoot(container);
    state.authenticated = true;
    await renderAndAdvance(1000);
    expect(cache.peekAuthSessionClientOk()).toBe(true);
    cache.clearAuthSessionClientCache();
  });
});

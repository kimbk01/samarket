// @vitest-environment jsdom
/**
 * 요청 증폭 근본 수정 2단계 2-C — 「로그인됨」 확인 뒤에는 /api/auth/session 1초 반복을 멈춘다.
 * 확인 전 동작(1초마다 확인)과 화면 판정은 그대로다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false, membership: { status: "checking" } as Record<string, unknown> }));

vi.mock("next/navigation", () => ({ usePathname: () => "/community-messenger/rooms/r1" }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
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

// @vitest-environment jsdom
/**
 * P0-1 membership recovery retry 계약:
 * 최대 3회 backoff(1.5s→3s→6s) 후 terminal(auth-recovery-failed),
 * terminal 에서는 자동 timer 재시도 금지, 명시 이벤트에서만 새 cycle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const getCurrentUserMock = vi.fn<() => { id: string } | null>(() => null);
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const resolveClientMembershipMock = vi.fn(async (_source: string) => ({
  status: "guest" as const,
}));
vi.mock("@/lib/auth/resolve-client-profile-session", () => ({
  resolveClientMembership: (source: string) => resolveClientMembershipMock(source),
}));

const ensureSessionHealthyMock = vi.fn<
  (source: string) => Promise<{ ok: boolean; phase: string; terminal?: boolean }>
>();
let capturedAuthHandler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  ensureSessionHealthy: (source: string) => ensureSessionHealthyMock(source),
  subscribeDibayAuthStateChange: (
    handler: (event: AuthChangeEvent, session: Session | null) => void,
  ) => {
    capturedAuthHandler = handler;
    return () => {
      capturedAuthHandler = null;
    };
  },
}));

vi.mock("@/lib/auth/test-auth-store", () => ({
  TEST_AUTH_CHANGED_EVENT: "dibay:test-auth-changed",
}));

import {
  peekClientMembershipRecoveryForTests,
  primeMembershipOnBoot,
  resetClientMembershipStateForTests,
  subscribeClientMembershipStoreForTests,
} from "@/hooks/use-client-membership-state";

const RECOVERING = { ok: false, phase: "recovering", terminal: false };
const TERMINAL_GUEST = { ok: false, phase: "terminal_guest", terminal: false };

describe("use-client-membership-state retry contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "info").mockImplementation(() => {});
    getCurrentUserMock.mockReturnValue(null);
    ensureSessionHealthyMock.mockReset();
  });

  afterEach(() => {
    resetClientMembershipStateForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("normal guest resolves without any retry timer", async () => {
    ensureSessionHealthyMock.mockResolvedValue(TERMINAL_GUEST);

    const state = await primeMembershipOnBoot();
    expect(state.status).toBe("guest");
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(1);
    const peek = peekClientMembershipRecoveryForTests();
    expect(peek.terminal).toBe(false);
    expect(peek.hasTimer).toBe(false);
    expect(peek.attempt).toBe(0);
  });

  it("fails with 1.5s → 3s → 6s backoff then terminal, no further timers", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    const unsubscribe = subscribeClientMembershipStoreForTests(() => {});

    await primeMembershipOnBoot();
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(1);
    expect(peekClientMembershipRecoveryForTests().hasTimer).toBe(true);

    // 1차 retry — 약 1.5s
    await vi.advanceTimersByTimeAsync(1_499);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(2);

    // 2차 retry — 약 3s
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(3);

    // 3차 retry — 약 6s → 실패 → terminal
    await vi.advanceTimersByTimeAsync(6_000);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(4);

    const peek = peekClientMembershipRecoveryForTests();
    expect(peek.terminal).toBe(true);
    expect(peek.hasTimer).toBe(false);

    // terminal 이후 자동 재시도 0회
    await vi.advanceTimersByTimeAsync(300_000);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(4);
    unsubscribe();
  });

  it("clears pending retry timer when the last subscriber unmounts", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    const unsubscribe = subscribeClientMembershipStoreForTests(() => {});

    await primeMembershipOnBoot();
    expect(peekClientMembershipRecoveryForTests().hasTimer).toBe(true);

    unsubscribe();
    expect(peekClientMembershipRecoveryForTests().hasTimer).toBe(false);
  });

  it("keeps a single timer across Strict Mode double-subscribe", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    const unsub1 = subscribeClientMembershipStoreForTests(() => {});
    const unsub2 = subscribeClientMembershipStoreForTests(() => {});

    await primeMembershipOnBoot();
    await primeMembershipOnBoot();
    expect(peekClientMembershipRecoveryForTests().hasTimer).toBe(true);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(1);

    unsub1();
    // 남은 구독자가 있으면 timer 유지 — 1개만
    expect(peekClientMembershipRecoveryForTests().hasTimer).toBe(true);
    unsub2();
    expect(peekClientMembershipRecoveryForTests().hasTimer).toBe(false);
  });

  it("resumes exactly one new cycle on visibility visible after terminal", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    const unsubscribe = subscribeClientMembershipStoreForTests(() => {});

    await primeMembershipOnBoot();
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(peekClientMembershipRecoveryForTests().terminal).toBe(true);
    const generationBefore = peekClientMembershipRecoveryForTests().generation;
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(4);

    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    const peek = peekClientMembershipRecoveryForTests();
    expect(peek.generation).toBe(generationBefore + 1);
    expect(peek.terminal).toBe(false);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(5);

    // terminal 이 아니면 visible 이벤트는 새 cycle 을 만들지 않는다
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(peekClientMembershipRecoveryForTests().generation).toBe(generationBefore + 1);
    unsubscribe();
  });

  it("resumes a new cycle on browser online after terminal", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    await primeMembershipOnBoot();
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(peekClientMembershipRecoveryForTests().terminal).toBe(true);

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(peekClientMembershipRecoveryForTests().terminal).toBe(false);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(5);
  });

  it("resets attempt counter on TOKEN_REFRESHED with session", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    await primeMembershipOnBoot();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(peekClientMembershipRecoveryForTests().attempt).toBeGreaterThan(0);
    const generationBefore = peekClientMembershipRecoveryForTests().generation;

    expect(capturedAuthHandler).not.toBeNull();
    capturedAuthHandler?.(
      "TOKEN_REFRESHED",
      { user: { id: "user-1" } } as unknown as Session,
    );

    const peek = peekClientMembershipRecoveryForTests();
    expect(peek.generation).toBe(generationBefore + 1);
    expect(peek.attempt).toBe(0);
    expect(peek.terminal).toBe(false);
  });

  it("does not restart resolve on remount while terminal (counter kept)", async () => {
    ensureSessionHealthyMock.mockResolvedValue(RECOVERING);
    await primeMembershipOnBoot();
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(peekClientMembershipRecoveryForTests().terminal).toBe(true);
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(4);

    // remount 는 새 cycle 을 만들지 못한다
    await primeMembershipOnBoot();
    expect(ensureSessionHealthyMock).toHaveBeenCalledTimes(4);
    expect(peekClientMembershipRecoveryForTests().terminal).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push/native/member-call-eligibility-bridge", () => ({
  setNativeMemberCallEligible: vi.fn(async () => undefined),
  projectNativeMemberEventEligibility: vi.fn(async () => undefined),
}));

describe("SIGNED_OUT auth lifecycle contract", () => {
  afterEach(async () => {
    const { resetDibaySessionManagerForTests } = await import("@/lib/auth/dibay-session-manager");
    const { resetExplicitLogoutIntentForTests } = await import("@/lib/auth/explicit-logout-intent");
    const { resetGuestAuthStateForTests } = await import("@/lib/auth/guest-auth-state");
    resetDibaySessionManagerForTests();
    resetExplicitLogoutIntentForTests();
    resetGuestAuthStateForTests();
  });

  it("unexpected SIGNED_OUT recovers then converges — never loops as open-ended guest wipe", async () => {
    const {
      dispatchDibayAuthStateChangeForTests,
      getSessionPhase,
    } = await import("@/lib/auth/dibay-session-manager");
    const { isTerminalGuestAuthEstablished } = await import("@/lib/auth/guest-auth-state");
    const { isUnexpectedSignedOutRecoveryInFlight } = await import(
      "@/lib/auth/unexpected-signed-out-recovery"
    );

    dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);
    expect(getSessionPhase()).toBe("recovering");
    expect(isUnexpectedSignedOutRecoveryInFlight()).toBe(true);

    await vi.waitFor(() => {
      expect(isUnexpectedSignedOutRecoveryInFlight()).toBe(false);
    });

    // No session available in unit env → converge to terminal_guest (not infinite recovering).
    expect(getSessionPhase()).toBe("terminal_guest");
    expect(isTerminalGuestAuthEstablished()).toBe(true);

    // Second SIGNED_OUT after settle starts a new recovery cycle (not stuck intent).
    dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);
    expect(["recovering", "terminal_guest"]).toContain(getSessionPhase());
  });

  it("explicit logout intent SIGNED_OUT becomes terminal_guest", async () => {
    const { beginExplicitLogoutIntent } = await import("@/lib/auth/explicit-logout-intent");
    const {
      dispatchDibayAuthStateChangeForTests,
      getSessionPhase,
    } = await import("@/lib/auth/dibay-session-manager");
    const { isTerminalGuestAuthEstablished } = await import("@/lib/auth/guest-auth-state");

    beginExplicitLogoutIntent("test_logout");
    dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);

    expect(getSessionPhase()).toBe("terminal_guest");
    expect(isTerminalGuestAuthEstablished()).toBe(true);
  });

  it("TOKEN_REFRESHED with session stays authenticated", async () => {
    const {
      dispatchDibayAuthStateChangeForTests,
      getSessionPhase,
    } = await import("@/lib/auth/dibay-session-manager");

    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", { user: { id: "u1" } } as never);
    expect(getSessionPhase()).toBe("authenticated");
  });
});

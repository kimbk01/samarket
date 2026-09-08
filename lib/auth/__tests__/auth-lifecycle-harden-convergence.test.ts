import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push/native/member-call-eligibility-bridge", () => ({
  setNativeMemberCallEligible: vi.fn(async () => undefined),
  projectNativeMemberEventEligibility: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/dibay-session-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dibay-session-manager")>();
  return {
    ...actual,
    ensureSessionHealthy: vi.fn(actual.ensureSessionHealthy),
  };
});

describe("auth lifecycle harden — convergence / intent / eligibility", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    const { resetDibaySessionManagerForTests } = await import("@/lib/auth/dibay-session-manager");
    const { resetExplicitLogoutIntentForTests } = await import("@/lib/auth/explicit-logout-intent");
    const { resetGuestAuthStateForTests } = await import("@/lib/auth/guest-auth-state");
    const { resetUnexpectedSignedOutRecoveryForTests } = await import(
      "@/lib/auth/unexpected-signed-out-recovery"
    );
    resetDibaySessionManagerForTests();
    resetExplicitLogoutIntentForTests();
    resetGuestAuthStateForTests();
    resetUnexpectedSignedOutRecoveryForTests();
  });

  it("convergeUnexpectedSignedOutHealth maps outcomes correctly", async () => {
    const { convergeUnexpectedSignedOutHealth } = await import(
      "@/lib/auth/unexpected-signed-out-recovery"
    );
    expect(convergeUnexpectedSignedOutHealth({ ok: true, phase: "authenticated" })).toBe(
      "authenticated",
    );
    expect(
      convergeUnexpectedSignedOutHealth({ ok: false, phase: "corrupt", terminal: true }),
    ).toBe("corrupt");
    expect(convergeUnexpectedSignedOutHealth({ ok: false, phase: "loading" })).toBe(
      "transient_recovering",
    );
    expect(convergeUnexpectedSignedOutHealth({ ok: false, phase: "recovering" })).toBe(
      "terminal_guest",
    );
  });

  it("unexpected SIGNED_OUT recovery dedupes while in flight", async () => {
    const {
      beginUnexpectedSignedOutRecovery,
      isUnexpectedSignedOutRecoveryInFlight,
      settleUnexpectedSignedOutRecovery,
    } = await import("@/lib/auth/unexpected-signed-out-recovery");

    const first = beginUnexpectedSignedOutRecovery();
    expect(first.skipped).toBe(false);
    expect(isUnexpectedSignedOutRecoveryInFlight()).toBe(true);
    const second = beginUnexpectedSignedOutRecovery();
    expect(second.skipped).toBe(true);
    settleUnexpectedSignedOutRecovery(first.generation);
    expect(isUnexpectedSignedOutRecoveryInFlight()).toBe(false);
  });

  it("explicit logout intent clears after clearExplicitLogoutIntent", async () => {
    const {
      beginExplicitLogoutIntent,
      clearExplicitLogoutIntent,
      isExplicitLogoutIntentActive,
    } = await import("@/lib/auth/explicit-logout-intent");
    beginExplicitLogoutIntent("test");
    expect(isExplicitLogoutIntentActive()).toBe(true);
    clearExplicitLogoutIntent();
    expect(isExplicitLogoutIntentActive()).toBe(false);
  });

  it("explicit logout flow always clears intent in finally", async () => {
    const flow = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/auth/explicit-logout-flow.ts", "utf8"),
    );
    const logout = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/auth/logout-client.ts", "utf8"),
    );
    expect(flow).toContain("clearExplicitLogoutIntent");
    expect(flow).toContain("finally");
    expect(logout).toContain("clearExplicitLogoutIntent");
    expect(logout).toContain("finally");
  });

  it("session manager projects eligibility on authenticated and terminal paths", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/auth/dibay-session-manager.ts", "utf8"),
    );
    expect(src).toContain("function applyAuthenticatedPhase");
    expect(src).toContain("function applyTerminalGuestPhase");
    expect(src).toContain("projectMemberEventEligibility(true");
    expect(src).toContain("projectMemberEventEligibility(false");
    expect(src).toContain("signed_out_unexpected_deduped");
    expect(src).toContain("signed_out_unexpected_converged");
  });

  it("iOS VoIP gate and NativeCallService setMemberCallEligible are wired", async () => {
    const fs = await import("node:fs");
    const voip = fs.readFileSync("ios/App/App/Push/VoIPPushRegistry.swift", "utf8");
    const plugin = fs.readFileSync("ios/App/App/Plugins/NativeCallServicePlugin.swift", "utf8");
    const store = fs.readFileSync(
      "ios/App/App/Call/DibayMemberEventEligibilityStore.swift",
      "utf8",
    );
    expect(store).toContain("dibay_member_event_eligible");
    expect(plugin).toContain("setMemberCallEligible");
    expect(plugin).toContain("DibayMemberEventEligibilityStore.setEligible");
    expect(voip).toContain("isMemberEventEligible");
    expect(voip).toContain("incoming_blocked_guest_ineligible");
  });
});

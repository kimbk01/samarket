import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markAuthBootstrapInitialSessionDone,
  resetAuthBootstrapStateForTests,
} from "@/lib/auth/auth-bootstrap-state";
import {
  clearGuestAuthState,
  establishGuestAuthState,
  isAuthMissing,
  isGuestAuthEstablished,
  noteGuest401,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";

describe("guest-auth-state", () => {
  beforeEach(() => {
    resetGuestAuthStateForTests();
    resetAuthBootstrapStateForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetGuestAuthStateForTests();
    resetAuthBootstrapStateForTests();
    vi.restoreAllMocks();
  });

  it("establishes guest once and logs measurement tags", () => {
    markAuthBootstrapInitialSessionDone(false);
    noteGuest401("test_source", { url: "/api/me/profile" });
    expect(isAuthMissing()).toBe(true);
    expect(isGuestAuthEstablished()).toBe(true);

    const calls = vi.mocked(console.info).mock.calls.map(([tag]) => String(tag));
    expect(calls).toContain("[guest-auth] guest_401_detected");
    expect(calls).toContain("[guest-auth] guest_state_established");
  });

  it("does not re-establish guest state", () => {
    markAuthBootstrapInitialSessionDone(false);
    establishGuestAuthState("first");
    vi.mocked(console.info).mockClear();
    establishGuestAuthState("second");
    expect(vi.mocked(console.info)).not.toHaveBeenCalled();
  });

  it("clears guest state on login recovery", () => {
    markAuthBootstrapInitialSessionDone(false);
    establishGuestAuthState("guest");
    clearGuestAuthState();
    expect(isAuthMissing()).toBe(false);
  });
});

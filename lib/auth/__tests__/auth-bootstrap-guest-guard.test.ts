import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markAuthBootstrapInitialSessionDone,
  resetAuthBootstrapStateForTests,
} from "@/lib/auth/auth-bootstrap-state";
import {
  establishGuestAuthState,
  isGuestAuthEstablished,
  noteGuest401,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";

describe("auth-bootstrap guest guard", () => {
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

  it("blocks guest establishment before INITIAL_SESSION completes", () => {
    noteGuest401("early_session_fetch");
    expect(isGuestAuthEstablished()).toBe(false);

    const calls = vi.mocked(console.info).mock.calls.map(([tag, payload]) => ({
      tag: String(tag),
      payload: String(payload),
    }));
    expect(calls.some((c) => c.tag === "[guest-auth] guest_401_detected")).toBe(true);
    expect(calls.some((c) => c.tag === "[guest-auth] guest_establishment_deferred")).toBe(true);
    expect(calls.some((c) => c.tag === "[guest-auth] guest_state_established")).toBe(false);
  });

  it("allows guest establishment after INITIAL_SESSION with no session", () => {
    markAuthBootstrapInitialSessionDone(false);
    establishGuestAuthState("after_initial_session");
    expect(isGuestAuthEstablished()).toBe(true);
  });

  it("force guest establishment bypasses bootstrap wait for explicit sign-out", () => {
    establishGuestAuthState("signed_out", { force: true });
    expect(isGuestAuthEstablished()).toBe(true);
  });
});

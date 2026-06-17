import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetGuestAuthStateForTests();
    vi.restoreAllMocks();
  });

  it("establishes guest once and logs measurement tags", () => {
    noteGuest401("test_source", { url: "/api/me/profile" });
    expect(isAuthMissing()).toBe(true);
    expect(isGuestAuthEstablished()).toBe(true);

    const calls = vi.mocked(console.info).mock.calls.map(([tag]) => String(tag));
    expect(calls).toContain("[guest_401_detected]");
    expect(calls).toContain("[guest_state_established]");
  });

  it("does not re-establish guest state", () => {
    establishGuestAuthState("first");
    vi.mocked(console.info).mockClear();
    establishGuestAuthState("second");
    expect(vi.mocked(console.info)).not.toHaveBeenCalled();
  });

  it("clears guest state on login recovery", () => {
    establishGuestAuthState("guest");
    clearGuestAuthState();
    expect(isAuthMissing()).toBe(false);
  });
});

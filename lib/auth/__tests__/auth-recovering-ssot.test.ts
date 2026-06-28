import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGuestAuthState,
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  isRecoverableGuestAuthEstablished,
  isTerminalGuestAuthEstablished,
  noteGuest401,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import { dispatchDibayAuthStateChangeForTests, getSessionPhase, resetDibaySessionManagerForTests } from "@/lib/auth/dibay-session-manager";
import { allowsPushRegistration, isRecoveringPhase, isTerminalGuestPhase } from "@/lib/auth/dibay-session-policy";

describe("auth recovering SSOT", () => {
  beforeEach(() => {
    resetGuestAuthStateForTests();
    resetDibaySessionManagerForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetGuestAuthStateForTests();
    resetDibaySessionManagerForTests();
  });

  it("INITIAL_SESSION empty does not terminal logout", () => {
    dispatchDibayAuthStateChangeForTests("INITIAL_SESSION", null);
    expect(getSessionPhase()).toBe("recovering");
    expect(isRecoverableGuestAuthEstablished()).toBe(true);
    expect(isTerminalGuestAuthEstablished()).toBe(false);
  });

  it("getUser empty enters recovering via establishRecoverableGuestAuthState", () => {
    establishRecoverableGuestAuthState("app_boot_get_user_empty");
    expect(isRecoverableGuestAuthEstablished()).toBe(true);
    expect(isTerminalGuestAuthEstablished()).toBe(false);
  });

  it("401 noteGuest401 enters recovering not terminal guest", () => {
    noteGuest401("fetchAuthSessionNoStore");
    expect(isRecoverableGuestAuthEstablished()).toBe(true);
    expect(isTerminalGuestAuthEstablished()).toBe(false);
  });

  it("terminal guest only after establishGuestAuthState", () => {
    establishGuestAuthState("explicit_logout");
    expect(isTerminalGuestAuthEstablished()).toBe(true);
    expect(isRecoverableGuestAuthEstablished()).toBe(false);
  });

  it("clearGuestAuthState clears recovering gate", () => {
    establishRecoverableGuestAuthState("boot");
    clearGuestAuthState();
    expect(isRecoverableGuestAuthEstablished()).toBe(false);
    expect(isTerminalGuestAuthEstablished()).toBe(false);
  });
});

describe("push registration session policy", () => {
  it("authenticated registers FCM", () => {
    expect(allowsPushRegistration("authenticated")).toBe(true);
  });

  it("recovering defers push register", () => {
    expect(allowsPushRegistration("recovering")).toBe(false);
    expect(isRecoveringPhase("recovering")).toBe(true);
  });

  it("terminal_guest skips push register", () => {
    expect(allowsPushRegistration("terminal_guest")).toBe(false);
    expect(isTerminalGuestPhase("terminal_guest")).toBe(true);
  });
});

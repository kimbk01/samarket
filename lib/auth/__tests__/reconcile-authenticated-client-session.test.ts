import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppBootStore, setAppBootAnonymous, getAppBootSnapshot } from "@/lib/app-boot/app-boot-store";
import {
  markAuthBootstrapInitialSessionDone,
  resetAuthBootstrapStateForTests,
} from "@/lib/auth/auth-bootstrap-state";
import {
  establishGuestAuthState,
  isGuestAuthEstablished,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import { reconcileAuthenticatedClientSession } from "@/lib/auth/reconcile-authenticated-client-session";

describe("reconcileAuthenticatedClientSession", () => {
  beforeEach(() => {
    resetGuestAuthStateForTests();
    resetAuthBootstrapStateForTests();
    resetAppBootStore();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetGuestAuthStateForTests();
    resetAuthBootstrapStateForTests();
    resetAppBootStore();
    vi.restoreAllMocks();
  });

  it("clears guest gate and resets anonymous boot for re-bootstrap", () => {
    markAuthBootstrapInitialSessionDone(false);
    establishGuestAuthState("test");
    setAppBootAnonymous();
    expect(isGuestAuthEstablished()).toBe(true);

    reconcileAuthenticatedClientSession("test");

    expect(isGuestAuthEstablished()).toBe(false);
    expect(getAppBootSnapshot().status).toBe("loading");
  });
});

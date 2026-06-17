import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppBootStore, setAppBootAnonymous, getAppBootSnapshot } from "@/lib/app-boot/app-boot-store";
import {
  establishGuestAuthState,
  isGuestAuthEstablished,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import { reconcileAuthenticatedClientSession } from "@/lib/auth/reconcile-authenticated-client-session";

describe("reconcileAuthenticatedClientSession", () => {
  beforeEach(() => {
    resetGuestAuthStateForTests();
    resetAppBootStore();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetGuestAuthStateForTests();
    resetAppBootStore();
    vi.restoreAllMocks();
  });

  it("clears guest gate and resets anonymous boot for re-bootstrap", () => {
    establishGuestAuthState("test");
    setAppBootAnonymous();
    expect(isGuestAuthEstablished()).toBe(true);

    reconcileAuthenticatedClientSession("test");

    expect(isGuestAuthEstablished()).toBe(false);
    expect(getAppBootSnapshot().status).toBe("loading");
  });
});

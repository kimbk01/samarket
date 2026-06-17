import { afterEach, describe, expect, it } from "vitest";
import {
  dispatchDibayAuthStateChangeForTests,
  getSessionPhase,
  resetDibaySessionManagerForTests,
  subscribeDibayAuthStateChange,
} from "@/lib/auth/dibay-session-manager";
import {
  isGuestAuthEstablished,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";

describe("dibay-session-manager auth event fan-out", () => {
  afterEach(() => {
    resetDibaySessionManagerForTests();
    resetGuestAuthStateForTests();
  });

  it("INITIAL_SESSION without user does not establish guest gate", () => {
    dispatchDibayAuthStateChangeForTests("INITIAL_SESSION", null);
    expect(isGuestAuthEstablished()).toBe(false);
    expect(getSessionPhase()).toBe("loading");
  });

  it("SIGNED_OUT establishes guest gate", () => {
    dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);
    expect(isGuestAuthEstablished()).toBe(true);
    expect(getSessionPhase()).toBe("guest");
  });

  it("subscribeDibayAuthStateChange receives canonical dispatch without duplicate onAuthStateChange", () => {
    const seen: string[] = [];
    subscribeDibayAuthStateChange((event) => seen.push(event));

    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", { user: { id: "u1" } } as never);
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", { user: { id: "u1" } } as never);

    expect(seen).toEqual(["TOKEN_REFRESHED", "SIGNED_IN"]);
    expect(getSessionPhase()).toBe("authenticated");
  });
});

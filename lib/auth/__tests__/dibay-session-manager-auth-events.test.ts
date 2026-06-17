import { afterEach, describe, expect, it } from "vitest";
import {
  dispatchDibayAuthStateChangeForTests,
  getSessionPhase,
  resetDibaySessionManagerForTests,
  subscribeDibayAuthStateChange,
} from "@/lib/auth/dibay-session-manager";

describe("dibay-session-manager auth event fan-out", () => {
  afterEach(() => {
    resetDibaySessionManagerForTests();
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

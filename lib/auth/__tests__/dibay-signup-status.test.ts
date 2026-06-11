import { describe, expect, it } from "vitest";
import {
  deriveDibaySignupStatus,
  isDibayIdComplete,
  resolveDibaySignupRoute,
} from "@/lib/auth/dibay-signup-status";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

const consented = {
  terms_accepted_at: "2026-01-01T00:00:00.000Z",
  terms_version: STORE_TERMS_VERSION,
  privacy_accepted_at: "2026-01-01T00:00:00.000Z",
  privacy_version: STORE_PRIVACY_VERSION,
};

describe("dibay-signup-status", () => {
  it("treats auto dibay_* as incomplete", () => {
    expect(
      isDibayIdComplete({
        dibay_id: "dibay_a1b2c3",
        dibay_id_locked: true,
        username_confirmed: true,
      })
    ).toBe(false);
  });

  it("terms_required before consent", () => {
    const status = deriveDibaySignupStatus({ id: "u1" }, { hasSession: true });
    expect(status.phase).toBe("terms_required");
    expect(resolveDibaySignupRoute(status)).toBe("/auth/onboarding/terms");
  });

  it("id_required after consent without dibay_id", () => {
    const status = deriveDibaySignupStatus({ id: "u1", ...consented }, { hasSession: true });
    expect(status.phase).toBe("id_required");
    expect(resolveDibaySignupRoute(status, "/philife")).toBe(
      "/auth/onboarding/dibay-id?next=%2Fphilife"
    );
  });

  it("completed when onboarding_completed_at set", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        ...consented,
        dibay_id: "boss_market",
        dibay_id_locked: true,
        username_confirmed: true,
        onboarding_completed_at: "2026-02-01T00:00:00.000Z",
      },
      { hasSession: true }
    );
    expect(status.signupComplete).toBe(true);
    expect(resolveDibaySignupRoute(status, "/philife")).toBe("/philife");
  });
});

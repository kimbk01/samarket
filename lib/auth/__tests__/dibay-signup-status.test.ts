import { describe, expect, it } from "vitest";
import {
  deriveDibaySignupStatus,
  isDibayIdComplete,
  isDibaySignupComplete,
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
  it("auto dibay_* passes gate when auto-assigned", () => {
    expect(
      isDibayIdComplete({
        dibay_id: "dibay_a1b2c3",
        dibay_id_auto_assigned: true,
        dibay_id_changed_once: false,
        dibay_id_locked: false,
        username_confirmed: true,
      })
    ).toBe(true);
  });

  it("terms_required before consent", () => {
    const status = deriveDibaySignupStatus({ id: "u1" }, { hasSession: true });
    expect(status.phase).toBe("terms_required");
    expect(status.signupComplete).toBe(false);
    expect(resolveDibaySignupRoute(status)).toBe("/auth/onboarding/terms");
  });

  it("signupComplete after consent only — no dibay-id redirect", () => {
    const status = deriveDibaySignupStatus({ id: "u1", ...consented }, { hasSession: true });
    expect(status.phase).toBe("completed");
    expect(status.signupComplete).toBe(true);
    expect(status.dibayIdComplete).toBe(false);
    expect(status.profileComplete).toBe(false);
    expect(resolveDibaySignupRoute(status, "/philife")).toBe("/philife");
  });

  it("gate regression: consented user is not signup-incomplete (DibaySignupGate must not redirect)", () => {
    const status = deriveDibaySignupStatus({ id: "u1", ...consented }, { hasSession: true });
    expect(status.consentComplete).toBe(true);
    expect(status.signupComplete).toBe(true);
    expect(isDibaySignupComplete(status)).toBe(true);
  });

  it("gate regression: resolve without next must not use id/profile as incomplete signal", () => {
    const status = deriveDibaySignupStatus({ id: "u1", ...consented }, { hasSession: true });
    expect(status.dibayIdComplete).toBe(false);
    expect(status.profileComplete).toBe(false);
    /** fresh-login landing 은 deep route 미허용 — gate 는 consentComplete 로 early return 해야 함 */
    expect(resolveDibaySignupRoute(status)).toBe("/mypage");
  });

  it("completed when consent given even without dibay id or profile", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        ...consented,
        onboarding_completed_at: "2026-02-01T00:00:00.000Z",
      },
      { hasSession: true }
    );
    expect(status.signupComplete).toBe(true);
    expect(resolveDibaySignupRoute(status, "/philife")).toBe("/philife");
  });

  it("tracks dibayIdComplete and profileComplete without blocking signup", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        ...consented,
        dibay_id: "boss_market",
        dibay_id_locked: true,
        username_confirmed: true,
      },
      { hasSession: true }
    );
    expect(status.phase).toBe("completed");
    expect(status.signupComplete).toBe(true);
    expect(status.dibayIdComplete).toBe(true);
    expect(status.profileComplete).toBe(false);
    expect(resolveDibaySignupRoute(status, "/philife")).toBe("/philife");
  });

  it("does not complete signup without consent even with full profile", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        dibay_id: "boss_market",
        dibay_id_locked: true,
        username_confirmed: true,
        display_name: "Boss Market",
        avatar_url: "https://img.example/avatar.png",
      },
      { hasSession: true }
    );
    expect(status.consentComplete).toBe(false);
    expect(status.dibayIdComplete).toBe(true);
    expect(status.profileComplete).toBe(true);
    expect(status.signupComplete).toBe(false);
  });

  it("legacy onboarding_completed_at does not bypass consent", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        dibay_id: "boss_market",
        dibay_id_locked: true,
        username_confirmed: true,
        display_name: "Boss Market",
        avatar_url: "https://img.example/avatar.png",
        onboarding_completed_at: "2026-02-01T00:00:00.000Z",
      },
      { hasSession: true }
    );
    expect(status.legacyCompleted).toBe(true);
    expect(status.signupComplete).toBe(false);
  });

  it("completes signup when consent is given", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        ...consented,
        dibay_id: "boss_market",
        dibay_id_locked: true,
        username_confirmed: true,
        display_name: "Boss Market",
        avatar_url: "https://img.example/avatar.png",
      },
      { hasSession: true }
    );
    expect(status.consentComplete).toBe(true);
    expect(status.signupComplete).toBe(true);
  });

  it("keeps fresh SNS session as signup incomplete before consent", () => {
    const status = deriveDibaySignupStatus({ id: "u1" }, { hasSession: true });
    expect(status.phase).toBe("terms_required");
    expect(status.signupComplete).toBe(false);
  });

  it("treats legacy username_confirmed as complete when dibay_id is empty", () => {
    expect(
      isDibayIdComplete({
        dibay_id: null,
        dibay_id_locked: false,
        username: "legacyuser",
        username_confirmed: true,
      })
    ).toBe(true);
  });
});

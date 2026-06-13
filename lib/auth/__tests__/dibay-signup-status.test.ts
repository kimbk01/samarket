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
        display_name: "Boss Market",
        avatar_url: "https://img.example/avatar.png",
        onboarding_completed_at: "2026-02-01T00:00:00.000Z",
      },
      { hasSession: true }
    );
    expect(status.signupComplete).toBe(true);
    expect(resolveDibaySignupRoute(status, "/philife")).toBe("/philife");
  });

  it("routes to profile setup when profile is incomplete after consent and dibay id", () => {
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
    expect(status.phase).toBe("profile_ready");
    expect(status.signupComplete).toBe(false);
    expect(resolveDibaySignupRoute(status, "/philife")).toBe(
      "/mypage/section/account/profile/edit?setup=1&next=%2Fphilife"
    );
  });

  it("does not complete signup with dibay_id only when consent is missing", () => {
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
    expect(status.legacyCompleted).toBe(false);
  });

  it("does not complete signup from onboarding_completed_at when consent is missing", () => {
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

  it("does not complete signup without confirmed dibay id", () => {
    const status = deriveDibaySignupStatus(
      {
        id: "u1",
        ...consented,
        display_name: "Boss Market",
        avatar_url: "https://img.example/avatar.png",
      },
      { hasSession: true }
    );
    expect(status.consentComplete).toBe(true);
    expect(status.dibayIdComplete).toBe(false);
    expect(status.signupComplete).toBe(false);
  });

  it("completes signup only when consent, dibay id, and profile are complete", () => {
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
    expect(status.dibayIdComplete).toBe(true);
    expect(status.profileComplete).toBe(true);
    expect(status.signupComplete).toBe(true);
  });

  it("keeps fresh SNS session as signup incomplete before gates", () => {
    const status = deriveDibaySignupStatus({ id: "u1" }, { hasSession: true });
    expect(status.phase).toBe("terms_required");
    expect(status.signupComplete).toBe(false);
  });
});

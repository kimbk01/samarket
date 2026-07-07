import { describe, expect, it } from "vitest";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";
import { ACTION_ACCESS_BASE_FIELDS } from "@/lib/profile/profile-requirements";

const completeBaseProfile = {
  display_name: "홍길동",
  nickname: "홍길동",
  dibay_id: "my_id",
  dibay_id_locked: true,
  username_confirmed: true,
  phone_verified: true,
  phone_verified_at: "2026-01-01T00:00:00.000Z",
};

describe("require-profile-completion", () => {
  it("community_write requires phone, dibay_id, display_name", () => {
    const missing = evaluateProfileRequirements(
      { display_name: null, nickname: null, phone_verified: false },
      "community_write"
    );
    expect(missing.satisfied).toBe(false);
    expect(missing.missingFields).toEqual(ACTION_ACCESS_BASE_FIELDS);

    const ok = evaluateProfileRequirements(completeBaseProfile, "community_write");
    expect(ok.satisfied).toBe(true);
  });

  it("trade_create_item requires base fields and default_address", () => {
    const result = evaluateProfileRequirements(
      {
        ...completeBaseProfile,
        has_default_address: false,
      },
      "trade_create_item"
    );
    expect(result.satisfied).toBe(false);
    expect(result.missingFields).toContain("default_address");

    const ok = evaluateProfileRequirements(
      { ...completeBaseProfile, has_default_address: true },
      "trade_create_item"
    );
    expect(ok.satisfied).toBe(true);
  });

  it("delivery_order requires base fields, address, and recipient phone", () => {
    const result = evaluateProfileRequirements(
      {
        ...completeBaseProfile,
        has_default_address: false,
      },
      "delivery_order"
    );
    expect(result.missingFields).toContain("default_address");
  });

  it("messenger_open uses base access fields", () => {
    const result = evaluateProfileRequirements(
      { display_name: "User", phone_verified: false, dibay_id_locked: false },
      "messenger_open"
    );
    expect(result.satisfied).toBe(false);
    expect(result.missingFields).toContain("phone_verified");
    expect(result.missingFields).toContain("dibay_id");
  });
});

describe("hasVerifiedPhone admin_manual alignment", () => {
  it("passes phone_verified=true", () => {
    expect(hasVerifiedPhone({ phone_verified: true })).toBe(true);
  });

  it("passes phone_verified_at", () => {
    expect(hasVerifiedPhone({ phone_verified_at: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });

  it("passes phone_verification_method=admin_manual", () => {
    expect(
      hasVerifiedPhone({
        phone_verified: false,
        phone_verification_method: "admin_manual",
      })
    ).toBe(true);
  });

  it("passes legacy manual_admin provider without phone_verified", () => {
    expect(
      hasVerifiedPhone({
        phone_verified: false,
        auth_provider: "manual_admin",
        email: "user@manual.local",
      })
    ).toBe(true);
  });

  it("blocks unverified sns member", () => {
    expect(
      hasVerifiedPhone({
        phone_verified: false,
        auth_provider: "google",
        email: "user@gmail.com",
      })
    ).toBe(false);
  });

  it("admin_manual passes community_write evaluator without phone_verified flag", () => {
    const evaluation = evaluateProfileRequirements(
      {
        display_name: "Admin User",
        nickname: "Admin User",
        dibay_id: "admin_user",
        dibay_id_locked: true,
        username_confirmed: true,
        phone_verified: false,
        auth_provider: "admin_manual",
        email: "ops@manual.local",
      },
      "community_write"
    );
    expect(evaluation.satisfied).toBe(true);
  });
});

describe("profile-requirements slugs", () => {
  it("maps public_id url slug to dibay_id", async () => {
    const { normalizeRequiredSlugFromUrl, fieldToRequiredSlug } = await import(
      "@/lib/profile/profile-requirements"
    );
    expect(normalizeRequiredSlugFromUrl("public_id")).toBe("dibay_id");
    expect(fieldToRequiredSlug("dibay_id")).toBe("public_id");
  });
});

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
  it("community_write requires phone and display_name, not dibay_id", () => {
    const missing = evaluateProfileRequirements(
      { display_name: null, nickname: null, phone_verified: false, dibay_id: null },
      "community_write"
    );
    expect(missing.satisfied).toBe(false);
    expect(missing.missingFields).toEqual(ACTION_ACCESS_BASE_FIELDS);
    expect(missing.missingFields).not.toContain("dibay_id");

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

  it("messenger_open has no profile requirements", () => {
    const result = evaluateProfileRequirements(
      { display_name: "User", phone_verified: false, dibay_id: null },
      "messenger_open"
    );
    expect(result.satisfied).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("feature actions never require dibay_id custom change", async () => {
    const { ACTION_PROFILE_REQUIREMENTS } = await import("@/lib/profile/profile-requirements");
    for (const fields of Object.values(ACTION_PROFILE_REQUIREMENTS)) {
      expect(fields).not.toContain("dibay_id");
    }
  });

  it("owner_store_register requires phone, display_name, and default_address", () => {
    const missing = evaluateProfileRequirements(
      { ...completeBaseProfile, has_default_address: false },
      "owner_store_register"
    );
    expect(missing.satisfied).toBe(false);
    expect(missing.missingFields).toContain("default_address");

    const ok = evaluateProfileRequirements(
      { ...completeBaseProfile, has_default_address: true },
      "owner_store_register"
    );
    expect(ok.satisfied).toBe(true);
  });

  it("auto-assigned handle with phone and display_name passes community_write", () => {
    const result = evaluateProfileRequirements(
      {
        display_name: "홍길동",
        nickname: "홍길동",
        dibay_id: "dibay_ab12cd",
        dibay_id_auto_assigned: true,
        dibay_id_changed_once: false,
        dibay_id_locked: false,
        phone_verified: true,
        phone_verified_at: "2026-01-01T00:00:00.000Z",
      },
      "community_write"
    );
    expect(result.satisfied).toBe(true);
    expect(result.missingFields).toEqual([]);
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

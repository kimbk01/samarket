import { describe, expect, it } from "vitest";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";
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
  /** 가입 조건(Owner 2026-11-20) — 대표 주소 */
  has_default_address: true,
};

describe("require-profile-completion", () => {
  it("community_write requires registration (phone + main address) and display_name, not dibay_id", () => {
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
        has_default_address: true,
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

  it("method=admin_manual label alone is not evidence (PR #94 — legacy seed asas22/33/44)", () => {
    for (const status of ["unverified", "verified"]) {
      const row = {
        role: "user",
        phone_verified: false,
        phone_verified_at: null,
        phone_verification_method: "admin_manual",
        phone_verification_status: status,
        provider: "email",
        auth_provider: "email",
        email: "seed@example.com",
      };
      expect(hasVerifiedPhone(row)).toBe(false);
      expect(hasPhilippinePhoneVerification(row)).toBe(false);
    }
  });

  it("admin approval (phone_verified + verified_at + admin_manual) still passes", () => {
    const row = {
      phone_verified: true,
      phone_verified_at: "2026-06-15T00:00:00.000Z",
      phone_verification_method: "admin_manual",
    };
    expect(hasVerifiedPhone(row)).toBe(true);
    expect(hasPhilippinePhoneVerification(row)).toBe(true);
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
        has_default_address: true,
      },
      "community_write"
    );
    expect(evaluation.satisfied).toBe(true);
  });
});

describe("가입 조건 (동의 + 전화 인증 + 대표 주소, Owner 2026-11-20)", () => {
  const registered = { ...completeBaseProfile };
  const actions = [
    "community_write",
    "community_comment",
    "community_like",
    "community_bookmark",
    "trade_create_item",
    "trade_chat",
    "trade_buy",
    "trade_favorite",
    "review_write",
    "messenger_new_chat",
    "messenger_send_message",
    "messenger_add_friend",
    "friend_chat",
    "delivery_cart_add",
    "delivery_order",
    "order_chat",
    "owner_store_register",
  ] as const;

  it.each(actions)("%s — 대표 주소 없으면 막힌다", (action) => {
    const r = evaluateProfileRequirements({ ...registered, has_default_address: false }, action);
    expect(r.satisfied).toBe(false);
    expect(r.missingFields).toContain("default_address");
  });

  it.each(actions)("%s — 전화 인증 없으면 막힌다", (action) => {
    const r = evaluateProfileRequirements({ ...registered, phone_verified: false, phone_verified_at: null }, action);
    expect(r.satisfied).toBe(false);
    expect(r.missingFields).toContain("phone_verified");
  });

  it.each(actions)("%s — 가입 완료 회원은 통과", (action) => {
    expect(evaluateProfileRequirements(registered, action).satisfied).toBe(true);
  });

  it.each(["community_report", "trade_report"] as const)("%s — 가입 조건 없음 (재감사 N1 신고)", (action) => {
    expect(evaluateProfileRequirements({}, action).satisfied).toBe(true);
  });

  it("call_start — 전화 인증만, 대표 주소는 요구하지 않음 (재감사 M3)", () => {
    expect(evaluateProfileRequirements({ ...registered, has_default_address: false }, "call_start").satisfied).toBe(true);
    const r = evaluateProfileRequirements({ ...registered, phone_verified: false, phone_verified_at: null }, "call_start");
    expect(r.missingFields).toEqual(["phone_verified"]);
  });

  it("열람(messenger_open)은 요구 항목 없음 — 가입 진행 중에도 읽기 가능", () => {
    expect(evaluateProfileRequirements({}, "messenger_open").satisfied).toBe(true);
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

import { describe, expect, it } from "vitest";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";

describe("require-profile-completion", () => {
  it("community_write requires display_name only", () => {
    const missing = evaluateProfileRequirements(
      { display_name: null, nickname: null },
      "community_write"
    );
    expect(missing.satisfied).toBe(false);
    expect(missing.missingFields).toEqual(["display_name"]);

    const ok = evaluateProfileRequirements(
      { display_name: "홍길동", nickname: "홍길동" },
      "community_write"
    );
    expect(ok.satisfied).toBe(true);
  });

  it("trade_create_item requires phone, display_name, address", () => {
    const result = evaluateProfileRequirements(
      {
        display_name: "Seller",
        phone_verified: false,
        has_default_address: false,
      },
      "trade_create_item"
    );
    expect(result.satisfied).toBe(false);
    expect(result.missingFields).toContain("phone_verified");
    expect(result.missingFields).toContain("default_address");
  });

  it("messenger_add_friend requires display_name and dibay_id", () => {
    const result = evaluateProfileRequirements(
      {
        display_name: "User",
        dibay_id_locked: false,
      },
      "messenger_add_friend"
    );
    expect(result.satisfied).toBe(false);
    expect(result.missingFields).toContain("dibay_id");

    const ok = evaluateProfileRequirements(
      {
        display_name: "User",
        dibay_id: "my_id",
        dibay_id_locked: true,
        username_confirmed: true,
      },
      "messenger_add_friend"
    );
    expect(ok.satisfied).toBe(true);
  });

  it("delivery_order requires phone and address", () => {
    const result = evaluateProfileRequirements(
      {
        phone_verified: true,
        has_default_address: false,
      },
      "delivery_order"
    );
    expect(result.missingFields).toContain("default_address");
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

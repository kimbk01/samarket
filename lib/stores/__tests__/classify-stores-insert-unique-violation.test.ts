import { describe, expect, it } from "vitest";
import { classifyStoresInsertUniqueViolation } from "@/lib/stores/classify-stores-insert-unique-violation";

describe("classifyStoresInsertUniqueViolation", () => {
  it("maps owner_user_id unique to already_has_active_application", () => {
    expect(
      classifyStoresInsertUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "stores_one_owner_one_store_uidx"',
        details: "Key (owner_user_id)=(11111111-1111-1111-1111-111111111111) already exists.",
      })
    ).toBe("already_has_active_application");
  });

  it("maps slug unique to slug_collision", () => {
    expect(
      classifyStoresInsertUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "stores_slug_key"',
        details: "Key (slug)=(myshop) already exists.",
      })
    ).toBe("slug_collision");
  });

  it("returns null for non-unique errors", () => {
    expect(classifyStoresInsertUniqueViolation({ code: "23503", message: "fk" })).toBeNull();
  });
});

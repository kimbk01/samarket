import { describe, expect, it } from "vitest";
import { getCanonicalCompositionRows } from "@/lib/stores/composition/stores-composition-canonical-registry";
import {
  detectForbiddenCompositionWriteFields,
  validateCompositionPolicyBatch,
  validateCompositionPolicyWriteRow,
} from "@/lib/stores/composition/stores-composition-policy-validation";
import { resolveCompositionPolicyForSurface } from "@/lib/stores/composition/stores-composition-policy-resolve";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";

const NOT_CONSUMED = { consumed: false as const, reason: "NOT_CONSUMED" as const };

function homeRow(slot: string, patch: Partial<Parameters<typeof validateCompositionPolicyWriteRow>[0]> = {}) {
  const canonical = getCanonicalCompositionRows("home").find((r) => r.slot === slot)!;
  return {
    surface: "home" as const,
    slot,
    contentType: canonical.contentType,
    enabled: canonical.enabled,
    order: canonical.order,
    max: canonical.max,
    interval: NOT_CONSUMED,
    ...patch,
  };
}

describe("stores-composition-policy-validation — negative", () => {
  it("rejects invalid surface", () => {
    const err = validateCompositionPolicyWriteRow({
      surface: "invalid",
      slot: "slot0Food",
      enabled: true,
      order: 0,
      max: 16,
      interval: NOT_CONSUMED,
    });
    expect(err?.code).toBe("invalid_surface");
  });

  it("rejects invalid slot", () => {
    const err = validateCompositionPolicyWriteRow({
      surface: "home",
      slot: "not_a_slot",
      enabled: true,
      order: 0,
      max: 16,
      interval: NOT_CONSUMED,
    });
    expect(err?.code).toBe("invalid_slot");
  });

  it("rejects contentType mismatch", () => {
    const err = validateCompositionPolicyWriteRow({
      ...homeRow("slot0Food"),
      contentType: "store",
    });
    expect(err?.code).toBe("content_type_mismatch");
  });

  it("rejects forbidden ranking field in body", () => {
    expect(detectForbiddenCompositionWriteFields({ rankingWeight: 1 })).toBe("rankingWeight");
    expect(
      detectForbiddenCompositionWriteFields({ rows: [{ manualStoreRank: 2 }] })
    ).toBe("manualStoreRank");
  });

  it("rejects negative max", () => {
    const err = validateCompositionPolicyWriteRow({ ...homeRow("slot0Food"), max: -1 });
    expect(err?.code).toBe("invalid_max");
  });

  it("rejects invalid order", () => {
    const err = validateCompositionPolicyWriteRow({ ...homeRow("slot0Food"), order: -1 });
    expect(err?.code).toBe("invalid_order");
  });

  it("rejects duplicate order in batch", () => {
    const rows = getCanonicalCompositionRows("home").map((r) => homeRow(r.slot));
    rows[1] = { ...rows[1]!, order: rows[0]!.order };
    const err = validateCompositionPolicyBatch("home", rows);
    expect(err?.code).toBe("duplicate_order");
  });

  it("rejects consumed interval in C2", () => {
    const err = validateCompositionPolicyWriteRow({
      ...homeRow("slot0Food"),
      interval: { consumed: true, everyN: 5 },
    });
    expect(err?.code).toBe("interval_not_consumed_only");
  });
});

describe("stores-composition-policy-resolve — default + override", () => {
  it("returns C1 defaults when no overrides", () => {
    const resolved = resolveCompositionPolicyForSurface("home", []);
    expect(resolved.map((r) => r.slot)).toEqual(
      STORES_HOME_COMPOSITION_DEFAULT_POLICY.map((r) => r.slot)
    );
    expect(resolved[0]?.max).toBe(STORES_HOME_COMPOSITION_DEFAULT_POLICY[0]?.max);
  });

  it("applies override without changing identity fields", () => {
    const resolved = resolveCompositionPolicyForSurface("home", [
      {
        surface: "home",
        slot: "slot0Food",
        enabled: false,
        order: 0,
        max: 12,
        interval: NOT_CONSUMED,
        hasOverride: true,
      },
    ]);
    const slot0 = resolved.find((r) => r.slot === "slot0Food");
    expect(slot0?.enabled).toBe(false);
    expect(slot0?.max).toBe(12);
    expect(slot0?.contentType).toBe("food_product");
  });
});

describe("stores-composition-policy-validation — batch completeness", () => {
  it("accepts full HOME surface batch", () => {
    const rows = getCanonicalCompositionRows("home").map((r) => homeRow(r.slot));
    expect(validateCompositionPolicyBatch("home", rows)).toBeNull();
  });
});

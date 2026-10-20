import { describe, expect, it } from "vitest";
import { buildOwnerStoreUpdateAuditDiff } from "@/lib/stores/owner-store-update-audit";

describe("ACC-06 — owner store update audit diff", () => {
  const current = {
    phone: "09171234567",
    is_open: true,
    delivery_radius_km: "3.0",
    business_hours_json: { mon: { open: "09:00", close: "18:00" } },
    address_line1: "1 Main St",
    lat: 14.65,
  };

  it("records only keys whose value actually changed (before from DB row, after from patch)", () => {
    const diff = buildOwnerStoreUpdateAuditDiff(current, {
      phone: "09990000000",
      is_open: false,
      delivery_radius_km: 3,
      business_hours_json: { mon: { close: "18:00", open: "09:00" } },
      address_line1: "9 New St",
    });
    expect(diff).toEqual({
      before: { phone: "09171234567", is_open: true, address_line1: "1 Main St" },
      after: { phone: "09990000000", is_open: false, address_line1: "9 New St" },
      fields: ["phone", "is_open", "address_line1"],
    });
  });

  it("returns null when nothing changed (no noise rows)", () => {
    expect(buildOwnerStoreUpdateAuditDiff(current, { is_open: true, lat: 14.65 })).toBeNull();
  });

  it("treats keys missing from the current row as null before", () => {
    expect(buildOwnerStoreUpdateAuditDiff({}, { kakao_id: "k1" })).toEqual({
      before: { kakao_id: null },
      after: { kakao_id: "k1" },
      fields: ["kakao_id"],
    });
  });
});

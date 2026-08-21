import { describe, expect, it } from "vitest";
import {
  presentSettlementKind,
  presentStoreOpenKind,
  resolveBusinessOpsOwnerIdentity,
  formatOpsListCityLine,
  formatOpsDetailAddressLine,
} from "@/lib/admin-business/business-ops-presentation";

describe("business-ops-presentation", () => {
  it("resolves owner as nickname (@id)", () => {
    const r = resolveBusinessOpsOwnerIdentity({
      ownerUserId: "u1",
      displayName: "김양수",
      username: "sinjinkim",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toBe("김양수 (@sinjinkim)");
  });

  it("does not fall back UUID as owner name", () => {
    const r = resolveBusinessOpsOwnerIdentity({
      ownerUserId: "12228d5c-7767-473b-8c22-08d969c03ca1",
    });
    expect(r.ok).toBe(false);
  });

  it("maps settlement statuses", () => {
    expect(presentSettlementKind(["held"])).toBe("held");
    expect(presentSettlementKind(["pending"])).toBe("needs_check");
    expect(presentSettlementKind(["scheduled"])).toBe("needs_check");
    expect(presentSettlementKind([])).toBe("ok");
  });

  it("maps temp close from is_open false", () => {
    const { kind } = presentStoreOpenKind(null, false);
    expect(kind).toBe("temp_closed");
  });

  it("list location uses city only", () => {
    expect(
      formatOpsListCityLine({
        region: "Metro Manila",
        city: "Quezon City",
      })
    ).toBe("Quezon City");
    expect(
      formatOpsListCityLine({
        region: "Metro Manila",
        city: null,
      })
    ).toBe("Metro Manila");
  });

  it("detail location includes full address parts", () => {
    expect(
      formatOpsDetailAddressLine({
        region: "Metro Manila",
        city: "Quezon City",
        district: "Payatas",
        address_line1: "LOWER GROUND",
        address_line2: null,
        detail_address: null,
        formatted_address: null,
      })
    ).toBe("Metro Manila · Quezon City · Payatas · LOWER GROUND");
  });
});

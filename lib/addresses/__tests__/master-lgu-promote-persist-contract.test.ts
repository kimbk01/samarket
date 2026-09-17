import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MASTER LGU — master promote persists resolvable LGU", () => {
  it("user-address-service touches canonical_lgu_id on master promote paths", () => {
    const src = readFileSync(join(process.cwd(), "lib/addresses/user-address-service.ts"), "utf8");
    expect(src).toContain("touchPersistCanonicalLguIfResolvable");
    expect(src).toContain("resolveCanonicalLguIdForAddressWrite");
    // All master-promotion writers must call the touch (not flag-only).
    expect(src).toMatch(/setUserAddressAsDefault[\s\S]*touchPersistCanonicalLguIfResolvable/);
    expect(src).toMatch(/ensureSomeoneDefaultIfFirst[\s\S]*touchPersistCanonicalLguIfResolvable/);
    expect(src).toMatch(/repairStoreLinkedMasterWhenGeneralAddressExists[\s\S]*touchPersistCanonicalLguIfResolvable/);
    expect(src).toMatch(/deleteUserAddress[\s\S]*touchPersistCanonicalLguIfResolvable/);
  });

  it("delivery-eta resolves member LGU like other Delivery surfaces", () => {
    const eta = readFileSync(
      join(process.cwd(), "app/api/stores/[slug]/delivery-eta/route.ts"),
      "utf8"
    );
    expect(eta).toContain("resolveMemberCanonicalLguId");
    expect(eta).not.toMatch(/canonicalLguId:\s*null/);
  });
});

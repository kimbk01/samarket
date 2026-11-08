import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MASTER LGU — master promote persists resolvable LGU", () => {
  it("user-address-service touches canonical_lgu_id on master promote paths", () => {
    const src = readFileSync(join(process.cwd(), "lib/addresses/user-address-service.ts"), "utf8");
    // 2026-11-09 주소 SSOT: LGU·앱 지역 ID 는 `deriveAddressLocation` 한 곳에서 계산해 대표 승격 시 기록
    expect(src).toContain("persistMasterAddressLocation");
    expect(src).toContain("deriveAddressLocation");
    // All master-promotion writers must call the touch (not flag-only).
    expect(src).toMatch(/setUserAddressAsDefault[\s\S]*persistMasterAddressLocation/);
    expect(src).toMatch(/ensureSomeoneDefaultIfFirst[\s\S]*persistMasterAddressLocation/);
    expect(src).toMatch(/repairStoreLinkedMasterWhenGeneralAddressExists[\s\S]*persistMasterAddressLocation/);
    expect(src).toMatch(/deleteUserAddress[\s\S]*persistMasterAddressLocation/);
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

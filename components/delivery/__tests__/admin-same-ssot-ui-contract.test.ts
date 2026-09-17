import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Admin same-SSOT UI first divergence close", () => {
  it("Owner and Admin wrappers share DeliveryServiceAreaEditorCore", () => {
    const owner = read("components/business/OwnerDeliveryServiceAreaEditor.tsx");
    const admin = read("components/admin/business/AdminDeliveryServiceAreaEditor.tsx");
    expect(owner).toContain("DeliveryServiceAreaEditorCore");
    expect(admin).toContain("DeliveryServiceAreaEditorCore");
    expect(owner).toContain("/api/me/stores/");
    expect(admin).toContain("/api/admin/stores/");
    expect(owner).toContain("delivery-service-areas");
    expect(admin).toContain("delivery-service-areas");
  });

  it("Admin Business CC delivery editor mounts shared Admin editor", () => {
    const editors = read("components/admin/business/AdminBusinessCcManageEditors.tsx");
    expect(editors).toContain("AdminDeliveryServiceAreaEditor");
    expect(editors).toContain("AdminBusinessCcDeliveryOverrideEditor");
  });

  it("store-own LGU round multi-select is not locked (removable)", () => {
    const core = read("components/delivery/DeliveryServiceAreaEditorCore.tsx");
    expect(core).toContain("business_delivery_service_area_store_home_badge");
    expect(core).not.toMatch(/disabled=\{[^}]*isStoreHome/);
    expect(core).toContain('role="checkbox"');
    expect(core).toContain("function toggleId");
    expect(core).toContain("data-delivery-service-area-band=\"base\"");
    expect(core).toContain("data-delivery-service-area-band=\"extended\"");
    expect(core).toContain("sm:grid-cols-2");
    expect(core).toContain("selectedRowClass");
    expect(core).toContain("selectedChips");
    // Selected visual must use real dibaY green token (not undefined --biz-brand) on the circle
    expect(core).toMatch(/data-round-multi-select[\s\S]*?--biz-primary|#0B421A/);
    expect(core).toContain('stroke="#ffffff"');
    expect(core).toContain('data-round-multi-select={checked ? "selected" : "unselected"}');
    const roundFn = core.slice(core.indexOf("function RoundMultiSelect"), core.indexOf("export function DeliveryServiceAreaEditorCore"));
    expect(roundFn).toContain("--biz-primary");
    expect(roundFn).not.toContain("--biz-brand");
  });

  it("Owner and Admin APIs write the same SSOT helpers", () => {
    const ownerApi = read("app/api/me/stores/[storeId]/delivery-service-areas/route.ts");
    const adminApi = read("app/api/admin/stores/[id]/delivery-service-areas/route.ts");
    expect(ownerApi).toContain("replaceStoreDeliveryServiceAreas");
    expect(adminApi).toContain("replaceStoreDeliveryServiceAreas");
    expect(ownerApi).toContain("loadStoreDeliveryServiceAreas");
    expect(adminApi).toContain("loadStoreDeliveryServiceAreas");
    expect(ownerApi).toContain("buildDeliveryServiceAreaEditorPayload");
    expect(adminApi).toContain("buildDeliveryServiceAreaEditorPayload");
    expect(ownerApi).toContain('source: "owner"');
    expect(adminApi).toContain('source: "admin"');
  });
});

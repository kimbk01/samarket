import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS,
  ADMIN_STORE_PATCH_COMMANDS,
  isAdminStorePatchAction,
} from "@/lib/admin-business/admin-store-patch-commands";

describe("admin-store-patch-commands", () => {
  it("gates unknown actions", () => {
    expect(isAdminStorePatchAction("set_store_taxonomy")).toBe(true);
    expect(isAdminStorePatchAction("set_store_contact")).toBe(true);
    expect(isAdminStorePatchAction("set_store_location")).toBe(true);
    expect(isAdminStorePatchAction("free_form_update")).toBe(false);
  });

  it("documents taxonomy and contact writes on stores table", () => {
    expect(ADMIN_STORE_PATCH_COMMANDS.set_store_taxonomy.writes).toContain(
      "stores.store_category_id"
    );
    expect(ADMIN_STORE_PATCH_COMMANDS.set_store_taxonomy.writes).toContain(
      "stores.store_topic_id"
    );
    expect(ADMIN_STORE_PATCH_COMMANDS.set_store_contact.writes).toContain("stores.phone");
    expect(ADMIN_STORE_PATCH_COMMANDS.set_store_location.writes).toContain("stores.lat");
  });

  it("keeps fee on external writers; delivery radius on set_delivery_radius SSOT", () => {
    expect(ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS.fee_store_override).toContain(
      "store-fee-policies"
    );
    expect(ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS.delivery_radius_ssot).toContain(
      "set_delivery_radius"
    );
    expect(ADMIN_STORE_PATCH_COMMANDS.set_delivery_radius.writes).toContain(
      "stores.delivery_radius_km"
    );
    expect(ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS.address_coords).toContain(
      "buildStoreLocationPatchFields"
    );
  });
});

describe("Admin R invalidation Owner parity", () => {
  it("set_delivery_radius clears HOME feed cache after discovery invalidate", () => {
    const adminRoute = readFileSync(
      join(process.cwd(), "app/api/admin/stores/[id]/route.ts"),
      "utf8"
    );
    const idx = adminRoute.indexOf('action === "set_delivery_radius"');
    expect(idx).toBeGreaterThan(0);
    const branch = adminRoute.slice(idx, adminRoute.indexOf("approve_sales", idx));
    expect(branch).toContain("invalidateDiscoveryAfterStoreWrite");
    expect(branch).toContain("clearStoreHomeFeedServerCache");
  });
});

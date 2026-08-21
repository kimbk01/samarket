import { describe, expect, it } from "vitest";
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

  it("keeps fee/distance on external SSOT writers", () => {
    expect(ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS.fee_store_override).toContain(
      "store-fee-policies"
    );
    expect(
      ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS.delivery_distance_store_override
    ).toContain("delivery/settings");
    expect(ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS.address_coords).toContain(
      "buildStoreLocationPatchFields"
    );
  });
});

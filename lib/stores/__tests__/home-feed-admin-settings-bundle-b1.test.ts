import { describe, expect, it } from "vitest";
import {
  HOME_FEED_ADMIN_SETTING_KEYS,
  resolveHomeFeedAdminSettingsBundleFromRows,
} from "@/lib/stores/home-feed-admin-settings-bundle";
import { DELIVERY_OPS_SETTING_KEYS } from "@/lib/delivery/delivery-ops-settings";
import { COMMERCE_SETTING_KEYS } from "@/lib/stores/commerce-settings-keys";

describe("B1 home-feed admin_settings bundle", () => {
  it("loads ride + distance + commerce keys in one key list", () => {
    expect(HOME_FEED_ADMIN_SETTING_KEYS).toContain(DELIVERY_OPS_SETTING_KEYS.rideTimeSource);
    expect(HOME_FEED_ADMIN_SETTING_KEYS).toContain(DELIVERY_OPS_SETTING_KEYS.distancePolicy);
    expect(HOME_FEED_ADMIN_SETTING_KEYS).toContain(DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides);
    expect(HOME_FEED_ADMIN_SETTING_KEYS).toContain(COMMERCE_SETTING_KEYS.popularMenuTopN);
  });

  it("resolves ride/distance/commerce from a single row set", () => {
    const bundle = resolveHomeFeedAdminSettingsBundleFromRows([
      { key: DELIVERY_OPS_SETTING_KEYS.rideTimeSource, value_json: { value: "google" } },
      {
        key: DELIVERY_OPS_SETTING_KEYS.distancePolicy,
        value_json: { enabled: true, source: "straight", overDistanceBehavior: "exclude" },
      },
      {
        key: DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides,
        value_json: { stores: { "store-1": { mode: "enabled", maxKm: 5 } } },
      },
      { key: COMMERCE_SETTING_KEYS.popularMenuTopN, value_json: { value: 7 } },
    ]);
    expect(bundle.rideTimeSource).toBe("google");
    expect(bundle.distance.policy.enabled).toBe(true);
    expect(bundle.distance.overrides.stores["store-1"]?.maxKm).toBe(5);
    expect(bundle.commerce.popularMenuTopN).toBe(7);
  });
});

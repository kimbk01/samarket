import { describe, expect, it } from "vitest";
import {
  describeDeliveryDistancePolicyRawDiff,
  normalizeDeliveryDistancePolicy,
} from "@/lib/delivery/delivery-ops-settings";

describe("LOC-011 distance policy raw vs applied", () => {
  it("production-shaped legacy JSON → overDistanceBehavior normalized, defaultMaxKm ignored", () => {
    const raw = { source: "straight", enabled: true, defaultMaxKm: 60, overDistanceBehavior: "deprioritize" };
    expect(describeDeliveryDistancePolicyRawDiff(raw)).toEqual({
      normalizedOnSave: ["overDistanceBehavior"],
      ignored: ["defaultMaxKm"],
    });
    // applied value shown by GET / stored on next save
    expect(normalizeDeliveryDistancePolicy(raw)).toMatchObject({
      enabled: true,
      source: "straight",
      overDistanceBehavior: "exclude",
    });
  });

  it("already-normalized JSON → no notice", () => {
    expect(
      describeDeliveryDistancePolicyRawDiff({
        enabled: false,
        source: "straight",
        defaultMaxKm: null,
        overDistanceBehavior: "exclude",
      })
    ).toEqual({ normalizedOnSave: [], ignored: [] });
  });

  it("missing row / non-object → no notice", () => {
    expect(describeDeliveryDistancePolicyRawDiff(null)).toEqual({ normalizedOnSave: [], ignored: [] });
  });

  it("unknown source / non-boolean enabled are reported as normalized", () => {
    expect(describeDeliveryDistancePolicyRawDiff({ enabled: "yes", source: "osm" }).normalizedOnSave).toEqual([
      "enabled",
      "source",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildStoreCoreInfoReverificationPatch,
  changedStoreCoreLocationFields,
  isStoreCoreInfoFlagColumnMissingError,
  shouldFlagStoreCoreInfoReverification,
} from "@/lib/stores/store-core-info-reverification";

const current = {
  region: "Metro Manila",
  city: "Quezon City",
  district: "Diliman",
  address_line1: "1 Main St",
  address_line2: null,
  lat: 14.65,
  lng: 121.05,
  phone: "09171234567",
};

describe("ND-2 — approved store core location change → re-verification flag", () => {
  it("detects real address / coordinate changes only", () => {
    expect(changedStoreCoreLocationFields(current, { address_line1: "9 New St", lat: 14.7 })).toEqual([
      "address_line1",
      "lat",
    ]);
    // re-saving the same values (whitespace / case / sub-metre jitter) is not a change
    expect(
      changedStoreCoreLocationFields(current, {
        region: " metro  manila ",
        city: "Quezon City",
        address_line1: "1 Main St",
        lat: 14.650001,
        lng: "121.05",
      })
    ).toEqual([]);
    // null ↔ value is a change
    expect(changedStoreCoreLocationFields(current, { address_line2: "Unit 3" })).toEqual(["address_line2"]);
    expect(changedStoreCoreLocationFields(current, { lat: null })).toEqual(["lat"]);
  });

  it("ignores non-core fields (operating info = audit only)", () => {
    expect(
      changedStoreCoreLocationFields(current, { phone: "09990000000", is_open: false, business_hours_json: {} })
    ).toEqual([]);
  });

  it("flags only approved stores with a real core change", () => {
    expect(shouldFlagStoreCoreInfoReverification("approved", ["city"])).toBe(true);
    expect(shouldFlagStoreCoreInfoReverification("approved", [])).toBe(false);
    for (const s of ["pending", "under_review", "revision_requested", "rejected", "suspended", null]) {
      expect(shouldFlagStoreCoreInfoReverification(s, ["city", "lat"])).toBe(false);
    }
  });

  it("builds the flag patch written in the same UPDATE as the change", () => {
    expect(buildStoreCoreInfoReverificationPatch(["lat", "lng"], "2026-10-21T01:00:00.000Z")).toEqual({
      core_info_review_status: "pending_reverification",
      core_info_changed_at: "2026-10-21T01:00:00.000Z",
      core_info_changed_fields: ["lat", "lng"],
    });
  });

  it("recognises the pre-migration missing-column error only", () => {
    expect(
      isStoreCoreInfoFlagColumnMissingError(
        "Could not find the 'core_info_changed_at' column of 'stores' in the schema cache"
      )
    ).toBe(true);
    expect(isStoreCoreInfoFlagColumnMissingError('column "core_info_review_status" does not exist')).toBe(true);
    expect(isStoreCoreInfoFlagColumnMissingError("violates check constraint stores_core_info_review_status_check")).toBe(
      false
    );
    expect(isStoreCoreInfoFlagColumnMissingError("permission denied")).toBe(false);
  });
});

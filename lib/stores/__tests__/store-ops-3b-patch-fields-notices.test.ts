import { describe, expect, it } from "vitest";
import {
  normalizeStoreBusinessHoursJsonForWrite,
  normalizeStoreGalleryImagesJsonForWrite,
  normalizeStoreGcashNumberForWrite,
  ownerStoreVisibilityChangeAllowed,
  parseStoreExpectedUpdatedAt,
} from "@/lib/stores/owner-store-patch-fields";
import { isStoreNoticesTableMissingError } from "@/lib/stores/store-notices-availability";
import { formatOwnerStorePatchError } from "@/lib/business/owner-store-patch-error-i18n";

describe("OPS-09 NOT NULL jsonb normalization (owner + admin shared)", () => {
  it("null → {} / []", () => {
    expect(normalizeStoreBusinessHoursJsonForWrite(null)).toEqual({ ok: true, value: {} });
    expect(normalizeStoreGalleryImagesJsonForWrite(null)).toEqual({ ok: true, value: [] });
  });
  it("valid objects pass through the persistence sanitizer", () => {
    const r = normalizeStoreBusinessHoursJsonForWrite({ min_order_php: 100 });
    expect(r).toEqual({ ok: true, value: { min_order_php: 100 } });
  });
  it("wrong shapes → field error codes", () => {
    expect(normalizeStoreBusinessHoursJsonForWrite("x")).toEqual({ ok: false, error: "invalid_business_hours_json" });
    expect(normalizeStoreBusinessHoursJsonForWrite([])).toEqual({ ok: false, error: "invalid_business_hours_json" });
    expect(normalizeStoreGalleryImagesJsonForWrite({})).toEqual({ ok: false, error: "invalid_gallery_images_json" });
  });
  it("expected_updated_at: omitted → null (legacy), malformed → error", () => {
    expect(parseStoreExpectedUpdatedAt(undefined)).toEqual({ ok: true, value: null });
    expect(parseStoreExpectedUpdatedAt("")).toEqual({ ok: true, value: null });
    expect(parseStoreExpectedUpdatedAt("2026-10-21T01:00:00.123456+00:00")).toEqual({
      ok: true,
      value: "2026-10-21T01:00:00.123456+00:00",
    });
    expect(parseStoreExpectedUpdatedAt("nope").ok).toBe(false);
    expect(parseStoreExpectedUpdatedAt(123).ok).toBe(false);
  });
});

describe("OPS-05 stores.email = GCash number", () => {
  it("normalizes PH mobile, empty clears, anything else is an error (never a silent null)", () => {
    expect(normalizeStoreGcashNumberForWrite("0917 123 4567")).toEqual({ ok: true, value: "09171234567" });
    expect(normalizeStoreGcashNumberForWrite("")).toEqual({ ok: true, value: null });
    expect(normalizeStoreGcashNumberForWrite(null)).toEqual({ ok: true, value: null });
    expect(normalizeStoreGcashNumberForWrite("a@b.com")).toEqual({ ok: false, error: "invalid_store_gcash_number" });
    expect(normalizeStoreGcashNumberForWrite("0917")).toEqual({ ok: false, error: "invalid_store_gcash_number" });
  });
});

describe("OPS-07 visibility gate", () => {
  it.each([
    ["approved", true],
    ["pending", false],
    ["under_review", false],
    ["revision_requested", false],
    ["", false],
  ] as const)("%s → %s", (st, ok) => {
    expect(ownerStoreVisibilityChangeAllowed(st)).toBe(ok);
  });
});

describe("OPS-01 missing store_notices table detection", () => {
  it("PostgREST / Postgres missing-table errors", () => {
    expect(isStoreNoticesTableMissingError({ code: "PGRST205", message: "x" })).toBe(true);
    expect(isStoreNoticesTableMissingError({ code: "42P01", message: "x" })).toBe(true);
    expect(
      isStoreNoticesTableMissingError({
        message: "Could not find the table 'public.store_notices' in the schema cache",
      })
    ).toBe(true);
    expect(isStoreNoticesTableMissingError({ code: "23514", message: "check constraint" })).toBe(false);
    expect(isStoreNoticesTableMissingError(null)).toBe(false);
  });
});

describe("3-B PATCH error codes are localized for owner forms", () => {
  it.each(["store_changed", "invalid_store_gcash_number", "store_not_approved_for_visibility", "update_failed"])(
    "%s",
    (code) => {
      expect(formatOwnerStorePatchError(code, "ko")).toBeTruthy();
      expect(formatOwnerStorePatchError(code, "en")).toBeTruthy();
      expect(formatOwnerStorePatchError(code, "en")).not.toBe(code);
    }
  );
});

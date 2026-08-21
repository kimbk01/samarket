/**
 * Shared store location field builder for Owner + Admin writers.
 * Callers must persist the returned patch, then run
 * `refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged` when lat/lng change.
 */
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";
import { assertStoreLocationPatchConsistent } from "@/lib/stores/store-location-patch-consistency";
import {
  parseFiniteLatitude,
  parseFiniteLongitude,
} from "@/lib/geo/parse-finite-geographic-coord";

export type StoreLocationCurrentRow = {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  place_id?: string | null;
  formatted_address?: string | null;
  lat?: unknown;
  lng?: unknown;
};

export type StoreLocationInput = {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  place_id?: string | null;
  formatted_address?: string | null;
  detail_address?: string | null;
  lat?: unknown;
  lng?: unknown;
};

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

function parseLat(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFiniteLatitude(v);
  return n == null ? "invalid" : n;
}

function parseLng(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFiniteLongitude(v);
  return n == null ? "invalid" : n;
}

function hasOwn(input: StoreLocationInput, key: keyof StoreLocationInput): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

/**
 * Build location columns for a stores UPDATE.
 * Empty input → `{ ok:true, touched:false, patch:{} }`.
 */
export function buildStoreLocationPatchFields(
  current: StoreLocationCurrentRow,
  input: StoreLocationInput
):
  | { ok: true; touched: boolean; patch: Record<string, unknown> }
  | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};

  if (hasOwn(input, "region")) patch.region = trimOrNull(input.region);
  if (hasOwn(input, "city")) patch.city = trimOrNull(input.city);

  const districtIn = hasOwn(input, "district") ? trimOrNull(input.district) : undefined;
  const address1In = hasOwn(input, "address_line1")
    ? trimOrNull(input.address_line1)
    : districtIn !== undefined
      ? districtIn
      : undefined;
  const address2In = hasOwn(input, "address_line2")
    ? trimOrNull(input.address_line2)
    : undefined;

  if (address1In !== undefined) patch.address_line1 = address1In;
  if (address2In !== undefined) patch.address_line2 = address2In;
  if (hasOwn(input, "place_id")) patch.place_id = trimOrNull(input.place_id);
  if (hasOwn(input, "formatted_address")) {
    patch.formatted_address = trimOrNull(input.formatted_address);
  }
  if (hasOwn(input, "detail_address")) {
    patch.detail_address = trimOrNull(input.detail_address);
  }

  if (hasOwn(input, "lat")) {
    const la = parseLat(input.lat);
    if (la === "invalid") return { ok: false, error: "invalid_lat" };
    patch.lat = la;
  }
  if (hasOwn(input, "lng")) {
    const ln = parseLng(input.lng);
    if (ln === "invalid") return { ok: false, error: "invalid_lng" };
    patch.lng = ln;
  }

  const addressTouched =
    hasOwn(input, "region") ||
    hasOwn(input, "city") ||
    hasOwn(input, "district") ||
    hasOwn(input, "address_line1") ||
    hasOwn(input, "address_line2");

  if (addressTouched) {
    const nextRegion =
      patch.region !== undefined
        ? (patch.region as string | null)
        : ((current.region as string | null) ?? null);
    const nextCity =
      patch.city !== undefined
        ? (patch.city as string | null)
        : ((current.city as string | null) ?? null);
    const nextA1 =
      patch.address_line1 !== undefined
        ? (patch.address_line1 as string | null)
        : ((current.address_line1 as string | null) ??
          (current.district as string | null) ??
          null);
    const nextA2 =
      patch.address_line2 !== undefined
        ? (patch.address_line2 as string | null)
        : ((current.address_line2 as string | null) ?? null);

    const norm = normalizeStoreAddressPh({
      region: nextRegion,
      city: nextCity,
      address1: nextA1,
      address2: nextA2,
    });

    patch.region = norm.region;
    patch.city = norm.city;
    patch.address_line1 = norm.address1;
    patch.address_line2 = norm.address2;
    patch.district = norm.address1;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, touched: false, patch: {} };
  }

  const locCheck = assertStoreLocationPatchConsistent(
    {
      place_id: current.place_id,
      formatted_address: current.formatted_address,
      address_line1: current.address_line1,
      lat: current.lat,
      lng: current.lng,
    },
    {
      ...(patch.place_id !== undefined ? { place_id: patch.place_id as string | null } : {}),
      ...(patch.formatted_address !== undefined
        ? { formatted_address: patch.formatted_address as string | null }
        : {}),
      ...(patch.address_line1 !== undefined
        ? { address_line1: patch.address_line1 as string | null }
        : {}),
      ...(patch.lat !== undefined ? { lat: patch.lat as number | null } : {}),
      ...(patch.lng !== undefined ? { lng: patch.lng as number | null } : {}),
    }
  );
  if (locCheck !== "ok") {
    return { ok: false, error: locCheck };
  }

  return { ok: true, touched: true, patch };
}

export function storeLocationPatchTouchesCoords(patch: Record<string, unknown>): boolean {
  return "lat" in patch || "lng" in patch;
}

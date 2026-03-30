import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { createUserAddress, listUserAddresses } from "@/lib/addresses/user-address-service";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";

export const dynamic = "force-dynamic";

function parsePayload(body: unknown): UserAddressWritePayload | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const labelType = String(o.labelType ?? o.label_type ?? "other").toLowerCase();
  if (!["home", "office", "shop", "other"].includes(labelType)) return null;
  return {
    labelType: labelType as UserAddressWritePayload["labelType"],
    nickname: o.nickname != null ? String(o.nickname) : null,
    recipientName: o.recipientName != null ? String(o.recipientName) : null,
    phoneNumber: o.phoneNumber != null ? String(o.phoneNumber) : null,
    countryCode: o.countryCode != null ? String(o.countryCode) : undefined,
    countryName: o.countryName != null ? String(o.countryName) : undefined,
    province: o.province != null ? String(o.province) : null,
    cityMunicipality: o.cityMunicipality != null ? String(o.cityMunicipality) : null,
    barangay: o.barangay != null ? String(o.barangay) : null,
    district: o.district != null ? String(o.district) : null,
    streetAddress: o.streetAddress != null ? String(o.streetAddress) : null,
    buildingName: o.buildingName != null ? String(o.buildingName) : null,
    unitFloorRoom: o.unitFloorRoom != null ? String(o.unitFloorRoom) : null,
    landmark: o.landmark != null ? String(o.landmark) : null,
    postalCode: o.postalCode != null ? String(o.postalCode) : null,
    latitude: typeof o.latitude === "number" ? o.latitude : null,
    longitude: typeof o.longitude === "number" ? o.longitude : null,
    fullAddress: o.fullAddress != null ? String(o.fullAddress) : null,
    neighborhoodName: o.neighborhoodName != null ? String(o.neighborhoodName) : null,
    appRegionId: o.appRegionId != null ? String(o.appRegionId) : null,
    appCityId: o.appCityId != null ? String(o.appCityId) : null,
    useForLife: o.useForLife !== false,
    useForTrade: o.useForTrade !== false,
    useForDelivery: o.useForDelivery !== false,
    isDefaultMaster: o.isDefaultMaster === true,
    isDefaultLife: o.isDefaultLife === true,
    isDefaultTrade: o.isDefaultTrade === true,
    isDefaultDelivery: o.isDefaultDelivery === true,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : undefined,
  };
}

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const addresses = await listUserAddresses(sb, userId);
    return NextResponse.json({ ok: true, addresses });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const p = parsePayload(body);
  if (!p) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const ph = normalizeOptionalPhMobileDb(p.phoneNumber ?? "");
  if (!ph.ok) {
    return NextResponse.json({ ok: false, error: ph.error }, { status: 400 });
  }
  const payload: UserAddressWritePayload = { ...p, phoneNumber: ph.value };
  try {
    const row = await createUserAddress(sb, userId, payload);
    return NextResponse.json({ ok: true, address: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { deleteUserAddress, updateUserAddress } from "@/lib/addresses/user-address-service";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";

export const dynamic = "force-dynamic";

function parseCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsePatch(body: unknown): Partial<UserAddressWritePayload> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const out: Partial<UserAddressWritePayload> = {};
  if (o.labelType != null || o.label_type != null) {
    const lt = String(o.labelType ?? o.label_type).toLowerCase();
    if (["home", "office", "shop", "other"].includes(lt)) {
      out.labelType = lt as UserAddressWritePayload["labelType"];
    }
  }
  const str = (k: string) => (o[k] !== undefined ? String(o[k]) : undefined);
  if (o.nickname !== undefined) out.nickname = str("nickname") ?? null;
  if (o.recipientName !== undefined || o.recipient_name !== undefined) {
    out.recipientName = String(o.recipientName ?? o.recipient_name ?? "") || null;
  }
  if (o.phoneNumber !== undefined || o.phone_number !== undefined) {
    out.phoneNumber = String(o.phoneNumber ?? o.phone_number ?? "") || null;
  }
  if (o.province !== undefined) out.province = str("province") ?? null;
  if (o.cityMunicipality !== undefined || o.city_municipality !== undefined) {
    out.cityMunicipality = String(o.cityMunicipality ?? o.city_municipality ?? "") || null;
  }
  if (o.barangay !== undefined) out.barangay = str("barangay") ?? null;
  if (o.district !== undefined) out.district = str("district") ?? null;
  if (o.streetAddress !== undefined || o.street_address !== undefined) {
    out.streetAddress = String(o.streetAddress ?? o.street_address ?? "") || null;
  }
  if (o.buildingName !== undefined || o.building_name !== undefined) {
    out.buildingName = String(o.buildingName ?? o.building_name ?? "") || null;
  }
  if (o.unitFloorRoom !== undefined || o.unit_floor_room !== undefined) {
    out.unitFloorRoom = String(o.unitFloorRoom ?? o.unit_floor_room ?? "") || null;
  }
  if (o.landmark !== undefined) out.landmark = str("landmark") ?? null;
  if (o.latitude !== undefined) out.latitude = parseCoord(o.latitude);
  if (o.longitude !== undefined) out.longitude = parseCoord(o.longitude);
  if (o.fullAddress !== undefined || o.full_address !== undefined) {
    out.fullAddress = String(o.fullAddress ?? o.full_address ?? "") || null;
  }
  if (o.neighborhoodName !== undefined || o.neighborhood_name !== undefined) {
    out.neighborhoodName = String(o.neighborhoodName ?? o.neighborhood_name ?? "") || null;
  }
  if (o.appRegionId !== undefined || o.app_region_id !== undefined) {
    out.appRegionId = String(o.appRegionId ?? o.app_region_id ?? "") || null;
  }
  if (o.appCityId !== undefined || o.app_city_id !== undefined) {
    out.appCityId = String(o.appCityId ?? o.app_city_id ?? "") || null;
  }
  if (o.useForLife !== undefined) out.useForLife = !!o.useForLife;
  if (o.useForTrade !== undefined) out.useForTrade = !!o.useForTrade;
  if (o.useForDelivery !== undefined) out.useForDelivery = !!o.useForDelivery;
  if (o.isDefaultMaster === true) out.isDefaultMaster = true;
  if (o.isDefaultLife === true) out.isDefaultLife = true;
  if (o.isDefaultTrade === true) out.isDefaultTrade = true;
  if (o.isDefaultDelivery === true) out.isDefaultDelivery = true;
  return out;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
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
  const patch = parsePatch(body);
  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }
  if (patch.phoneNumber !== undefined) {
    const ph = normalizeOptionalPhMobileDb(patch.phoneNumber ?? "");
    if (!ph.ok) {
      return NextResponse.json({ ok: false, error: ph.error }, { status: 400 });
    }
    patch.phoneNumber = ph.value;
  }
  try {
    const row = await updateUserAddress(sb, userId, id.trim(), patch);
    return NextResponse.json({ ok: true, address: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    await deleteUserAddress(sb, userId, id.trim());
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "delete_failed";
    const status = msg.includes("마지막") ? 400 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

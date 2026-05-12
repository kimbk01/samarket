import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { deleteUserAddress, updateUserAddress } from "@/lib/addresses/user-address-service";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import {
  loadUserAddressDtoForBuyer,
  refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated,
} from "@/lib/stores/sync-store-orders-checkout-geo";
import { parseUserAddressWritePayload } from "@/lib/addresses/address-api-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const patch = parseUserAddressWritePayload(body, { partial: true }) as Partial<UserAddressWritePayload> | null;
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
    const addressBefore = await loadUserAddressDtoForBuyer(sb as never, userId, id.trim());
    const row = await updateUserAddress(sb, userId, id.trim(), patch);
    const store_orders_checkout_geo_sync = await refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated(
      sb as never,
      userId,
      row,
      addressBefore
    );
    return NextResponse.json({ ok: true, address: row, store_orders_checkout_geo_sync });
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

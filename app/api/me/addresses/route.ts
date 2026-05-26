import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { createUserAddress, listUserAddresses } from "@/lib/addresses/user-address-service";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import { refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated } from "@/lib/stores/sync-store-orders-checkout-geo";
import { parseUserAddressWritePayload } from "@/lib/addresses/address-api-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAddressApiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "load_failed");
  const msg = raw.toLowerCase();
  if (
    msg.includes("user_addresses") &&
    (msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache"))
  ) {
    return "user_addresses_table_missing";
  }
  return raw;
}

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const addresses = await listUserAddresses(sb, userId);
    return NextResponse.json({ ok: true, addresses });
  } catch (e) {
    const msg = normalizeAddressApiErrorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
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
  const p = parseUserAddressWritePayload(body) as UserAddressWritePayload | null;
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
    const store_orders_checkout_geo_sync = await refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated(
      sb as never,
      userId,
      row,
      null
    );
    return NextResponse.json({ ok: true, address: row, store_orders_checkout_geo_sync });
  } catch (e) {
    const msg = normalizeAddressApiErrorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

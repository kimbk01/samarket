import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { createUserAddress, listUserAddresses } from "@/lib/addresses/user-address-service";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import { parseUserAddressWritePayload } from "@/lib/addresses/address-api-validation";
import { toPublicUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAddressApiErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? fallback);
  const msg = raw.toLowerCase();
  if (
    msg.includes("user_addresses") &&
    (msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache"))
  ) {
    return "user_addresses_table_missing";
  }
  return toPublicUserAddressApiError(raw, fallback);
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
    const msg = normalizeAddressApiErrorMessage(e, "load_failed");
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
    return NextResponse.json({ ok: true, address: row });
  } catch (e) {
    const msg = normalizeAddressApiErrorMessage(e, "address_create_failed");
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

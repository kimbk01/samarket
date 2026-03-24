import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/**
 * 매장 장바구니 등에서 자동 채움용 — test_users.contact_* 우선, 없으면 profiles.phone / region.
 */
export async function GET() {
  const uid = await getRouteUserId();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      contact_phone: null as string | null,
      contact_address: null as string | null,
    });
  }

  let contact_phone: string | null = null;
  let contact_address: string | null = null;

  const { data: tu } = await sb
    .from("test_users")
    .select("contact_phone, contact_address")
    .eq("id", uid)
    .maybeSingle();

  if (tu) {
    const p = typeof tu.contact_phone === "string" ? tu.contact_phone.trim() : "";
    const a = typeof tu.contact_address === "string" ? tu.contact_address.trim() : "";
    if (p) contact_phone = p;
    if (a) contact_address = a;
  }

  if (!contact_phone) {
    const { data: prof } = await sb.from("profiles").select("phone").eq("id", uid).maybeSingle();
    const ph = typeof prof?.phone === "string" ? prof.phone.trim() : "";
    if (ph) contact_phone = ph;
  }

  if (!contact_address) {
    const { data: prof2 } = await sb
      .from("profiles")
      .select("region_name, region_code")
      .eq("id", uid)
      .maybeSingle();
    const rn = typeof prof2?.region_name === "string" ? prof2.region_name.trim() : "";
    if (rn) contact_address = rn;
  }

  return NextResponse.json({
    ok: true,
    contact_phone,
    contact_address,
  });
}

import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";

export const dynamic = "force-dynamic";

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
    const defaults = await getUserAddressDefaults(sb, userId);
    return NextResponse.json({ ok: true, defaults });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

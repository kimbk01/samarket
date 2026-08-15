import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** USER current address snapshot — current authority is `user_addresses.is_default_master`. */

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
    const defaults = await getUserAddressDefaults(sb, userId);
    return NextResponse.json({
      ok: true,
      defaults: {
        master: defaults.master,
        life: null,
        trade: null,
        delivery: null,
      },
      neighborhoodFromLife: null,
    });
  } catch (e) {
    console.error("[address-defaults]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

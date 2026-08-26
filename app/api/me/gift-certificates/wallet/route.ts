import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadGiftWallet } from "@/lib/gift-certificate/load-gift-wallet";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/gift-certificates/wallet */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const loaded = await loadGiftWallet(sb, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, wallet: loaded.wallet });
}

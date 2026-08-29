import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadGiftTransferPresentations } from "@/lib/gift-certificate/load-gift-transfer-presentations";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/presentation — batched G4 enrichment */
export async function POST(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { transferIds?: string[] } | null;
  const transferIds = Array.isArray(body?.transferIds) ? body!.transferIds! : [];
  const loaded = await loadGiftTransferPresentations(sb, userId, transferIds);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: loaded.items });
}

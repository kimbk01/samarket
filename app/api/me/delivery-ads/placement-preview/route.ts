import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { loadDeliveryAdPlacementPreviewStore } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UI-1 — Owner application step 3 store preview (read-only, reuses CUT-2 loader). */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const storeId = String(req.nextUrl.searchParams.get("storeId") ?? "").trim();
  const langRaw = String(req.nextUrl.searchParams.get("lang") ?? "ko").trim();
  const lang = langRaw === "en" ? "en" : "ko";

  if (!storeId) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const loaded = await loadDeliveryAdPlacementPreviewStore(sb, storeId, lang);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error, store: null }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    store: loaded.store,
    storeName: loaded.store.nameKo,
    eligibilityWarning: loaded.eligibilityWarning,
    taxonomy: loaded.taxonomy,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadAdminStoreDiscoverySnapshot } from "@/lib/stores/admin-store-discovery-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin Discovery Control v1 — per-store discovery snapshot READ only. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { storeId: rawId } = await context.params;
  const storeId = typeof rawId === "string" ? rawId.trim() : "";
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const result = await loadAdminStoreDiscoverySnapshot(sb, storeId);
  if (!result.ok) {
    const status =
      result.error === "store_not_found" ? 404 : result.error === "missing_store_id" ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: result.error ?? "store_load_error", snapshot: null },
      { status }
    );
  }
  return NextResponse.json({ ok: true, snapshot: result.snapshot });
}

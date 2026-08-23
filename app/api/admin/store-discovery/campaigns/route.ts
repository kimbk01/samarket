import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadAdminStoreDiscoveryCampaignMonitor } from "@/lib/stores/admin-store-discovery-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin Discovery Control v1 — campaign monitor READ only. */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const result = await loadAdminStoreDiscoveryCampaignMonitor(sb);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "campaigns_load_error",
        now: result.now,
        campaigns: [],
      },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    now: result.now,
    campaigns: result.campaigns,
  });
}

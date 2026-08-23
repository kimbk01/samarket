import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadAdminRatingConfidencePolicyRead } from "@/lib/stores/admin-store-discovery-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin Discovery Control v1 — rating policy READ only. */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const result = await loadAdminRatingConfidencePolicyRead(sb);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "policy_load_error", policy: null },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, policy: result.policy });
}

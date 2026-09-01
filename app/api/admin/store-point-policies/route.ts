import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/store-point-policies */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("store_point_policies")
    .select(
      "id, policy_name, store_id, category_id, fee_mode, fixed_point, percent_rate, minimum_point, maximum_point, is_active, starts_at, ends_at, priority, memo, is_archived, created_at, updated_at"
    )
    .eq("is_archived", false)
    .order("priority", { ascending: true })
    .limit(200);

  if (error) {
    if (/store_point_policies/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: true, policies: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, policies: data ?? [] });
}

/** Historical fee policies are immutable after the three-currency cutover. */
export async function POST(_req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    { ok: false, error: "historical_store_credit_read_only" },
    { status: 410 }
  );
}

import { NextRequest, NextResponse } from "next/server";
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

type PostBody = {
  policy_name?: string;
  store_id?: string | null;
  category_id?: string | null;
  fee_mode?: string;
  fixed_point?: number;
  percent_rate?: number;
  minimum_point?: number;
  maximum_point?: number;
  is_active?: boolean;
  priority?: number;
};

/** POST /api/admin/store-point-policies */
export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.policy_name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "policy_name_required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("store_point_policies")
    .insert({
      policy_name: name,
      store_id: body.store_id?.trim() || null,
      category_id: body.category_id?.trim() || null,
      fee_mode: String(body.fee_mode ?? "fixed"),
      fixed_point: Math.max(0, Math.floor(Number(body.fixed_point) || 0)),
      percent_rate: Number(body.percent_rate) || 0,
      minimum_point: Math.max(0, Math.floor(Number(body.minimum_point) || 0)),
      maximum_point: Math.max(0, Math.floor(Number(body.maximum_point) || 0)),
      is_active: body.is_active !== false,
      priority: Math.floor(Number(body.priority) || 100),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

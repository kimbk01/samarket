import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import {
  isMissingPointPlansTable,
  normalizePointPlanRow,
  POINT_PLAN_ROW_SELECT,
} from "@/lib/points/point-plan-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/point-plans — 활성 충전 플랜 목록 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, plans: [] });
  }

  const lang = normalizeAppLanguage(req.headers.get("x-app-language") ?? req.cookies.get("app_language")?.value);

  const { data: rows, error } = await sb
    .from("point_plans")
    .select(POINT_PLAN_ROW_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingPointPlansTable(error.message ?? "")) {
      return NextResponse.json({ ok: true, plans: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const plans = (rows ?? []).map((row) => normalizePointPlanRow(row as Record<string, unknown>, lang));
  return NextResponse.json({ ok: true, plans });
}

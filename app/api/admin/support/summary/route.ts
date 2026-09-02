import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getAdminSupportSummary } from "@/lib/support/support-case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/support/summary — A2-2 badge + dashboard SSOT. */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const res = await getAdminSupportSummary(sb);
  if (!res.ok) {
    const status = res.error === "missing_table" ? 503 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, ...res.summary });
}

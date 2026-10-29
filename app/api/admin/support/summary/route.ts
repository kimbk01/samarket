import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getAdminSupportSummary } from "@/lib/support/support-case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/support/summary — A2-2 badge + dashboard SSOT. */
export async function GET() {
  // E-7: 고객지원 = support 키 (GET 과 같은 키)
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
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

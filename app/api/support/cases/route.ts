import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listSupportCasesForRequester } from "@/lib/support/support-case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/support/cases — requester's own support cases (history). */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const audienceRaw = String(req.nextUrl.searchParams.get("audience") ?? "")
    .trim()
    .toUpperCase();
  const audience =
    audienceRaw === "MEMBER" || audienceRaw === "OWNER" ? audienceRaw : undefined;
  const storeId = String(req.nextUrl.searchParams.get("storeId") ?? "").trim() || null;

  const res = await listSupportCasesForRequester(sb, {
    userId: auth.userId,
    audience,
    storeId: audience === "OWNER" ? storeId : null,
  });
  if (!res.ok) {
    const status = res.error === "missing_table" ? 503 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, cases: res.cases });
}

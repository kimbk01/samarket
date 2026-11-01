import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadOwnerNoticeResults } from "@/lib/admin/notification-campaigns/owner-notice-results";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 「매장 알림」 결과(읽기 전용 · 재감사 2026-11-02 S3). `?days=7|30|90` (기본 30). */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  const raw = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const days = [7, 30, 90].includes(raw) ? raw : 30;
  try {
    const result = await loadOwnerNoticeResults(svc, { days });
    return NextResponse.json({ ok: true, days, ...result });
  } catch (err) {
    console.error("[admin/notification-campaigns/owner-notices]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

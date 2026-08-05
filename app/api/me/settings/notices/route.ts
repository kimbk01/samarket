import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPublishedNow(row: {
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}): boolean {
  if (!row.is_active) return false;
  const now = Date.now();
  if (row.starts_at) {
    const t = Date.parse(String(row.starts_at));
    if (Number.isFinite(t) && t > now) return false;
  }
  if (row.ends_at) {
    const t = Date.parse(String(row.ends_at));
    if (Number.isFinite(t) && t < now) return false;
  }
  return true;
}

/**
 * Phase 2 — board SSOT only. Do not merge notification_events (Bell) into CS notice list.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, notices: [], source: "fallback" });
  }

  const { data: boardRows, error: boardError } = await sb
    .from("app_notices")
    .select("id, title, body, created_at, is_active, starts_at, ends_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (boardError) {
    if (isMissingAppNoticesTableError(boardError.message ?? "")) {
      return NextResponse.json({ ok: true, notices: [], source: "table_missing" });
    }
    return NextResponse.json(
      { ok: false, error: boardError.message ?? "notices_fetch_failed" },
      { status: 500 }
    );
  }

  const notices = [];
  for (const row of boardRows ?? []) {
    if (!isPublishedNow(row as { is_active?: boolean; starts_at?: string | null; ends_at?: string | null })) {
      continue;
    }
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    notices.push({
      id,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? ""),
      href: buildAppNoticeDetailPath(id),
      source: "board" as const,
    });
  }

  return NextResponse.json({
    ok: true,
    notices,
    source: "app_notices_ssot",
  });
}

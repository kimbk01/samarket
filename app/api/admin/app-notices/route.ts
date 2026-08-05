import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/app-notices — list all for Admin */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("app_notices")
    .select("id, title, body, is_active, starts_at, ends_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json({ ok: true, notices: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notices: data ?? [] });
}

/** POST /api/admin/app-notices — create board notice */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    is_active?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
  };
  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 20000);
  if (!title || !text) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("app_notices")
    .insert({
      title,
      body: text,
      is_active: body.is_active !== false,
      starts_at: body.starts_at?.trim() || null,
      ends_at: body.ends_at?.trim() || null,
      created_at: now,
      updated_at: now,
    })
    .select("id, title, body, is_active, starts_at, ends_at, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: "table_missing", hint: "Apply migration 20261018120000_app_notices" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const id = String(data.id);
  return NextResponse.json({
    ok: true,
    notice: data,
    memberHref: buildAppNoticeDetailPath(id),
  });
}

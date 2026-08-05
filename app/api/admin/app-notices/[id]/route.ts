import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id: raw } = await ctx.params;
  const id = String(raw ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("app_notices")
    .select("id, title, body, is_active, starts_at, ends_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    notice: data,
    memberHref: buildAppNoticeDetailPath(id),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id: raw } = await ctx.params;
  const id = String(raw ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
  if (typeof body.body === "string") patch.body = body.body.trim().slice(0, 20000);
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.starts_at !== undefined) patch.starts_at = body.starts_at?.trim() || null;
  if (body.ends_at !== undefined) patch.ends_at = body.ends_at?.trim() || null;

  if (patch.title === "" || patch.body === "") {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("app_notices")
    .update(patch)
    .eq("id", id)
    .select("id, title, body, is_active, starts_at, ends_at, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    notice: data,
    memberHref: buildAppNoticeDetailPath(id),
  });
}

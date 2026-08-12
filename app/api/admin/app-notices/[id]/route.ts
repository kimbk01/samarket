import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentType,
  parseCustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
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
    .select(APP_NOTICES_CONTENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const contentType = parseCustomerCenterContentType(data.content_type, "notice");
  return NextResponse.json({
    ok: true,
    notice: data,
    memberHref: buildAppNoticeDetailPath(id),
    canonicalHref: buildCustomerCenterBoardDetailPath(contentType, id),
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
    content_type?: string;
    hero_image_url?: string | null;
    author_label?: string | null;
    comment_enabled?: boolean;
    is_active?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    archived?: boolean;
    soft_delete?: boolean;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
  if (typeof body.body === "string") patch.body = body.body.trim().slice(0, 20000);
  if (isCustomerCenterContentType(body.content_type)) patch.content_type = body.content_type;
  if (body.hero_image_url !== undefined) {
    patch.hero_image_url =
      typeof body.hero_image_url === "string" && body.hero_image_url.trim()
        ? body.hero_image_url.trim()
        : null;
  }
  if (body.author_label !== undefined) {
    patch.author_label =
      typeof body.author_label === "string" && body.author_label.trim()
        ? body.author_label.trim().slice(0, 80)
        : null;
  }
  if (typeof body.comment_enabled === "boolean") patch.comment_enabled = body.comment_enabled;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.starts_at !== undefined) patch.starts_at = body.starts_at?.trim() || null;
  if (body.ends_at !== undefined) patch.ends_at = body.ends_at?.trim() || null;
  if (body.archived === true) patch.archived_at = new Date().toISOString();
  if (body.archived === false) patch.archived_at = null;
  if (body.soft_delete === true) patch.deleted_at = new Date().toISOString();

  if (patch.title === "" || patch.body === "") {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("app_notices")
    .update(patch)
    .eq("id", id)
    .select(APP_NOTICES_CONTENT_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const contentType = parseCustomerCenterContentType(data.content_type, "notice");
  return NextResponse.json({
    ok: true,
    notice: data,
    memberHref: buildAppNoticeDetailPath(id),
    canonicalHref: buildCustomerCenterBoardDetailPath(contentType, id),
  });
}

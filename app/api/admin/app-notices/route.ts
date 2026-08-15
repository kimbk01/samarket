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
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/app-notices — list Customer Center contents */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const typeRaw = req.nextUrl.searchParams.get("content_type");
  let q = sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (isCustomerCenterContentType(typeRaw)) {
    q = q.eq("content_type", typeRaw);
  }

  const { data, error } = await q;

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json({ ok: true, notices: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notices: data ?? [] });
}

/** POST /api/admin/app-notices — create board content */
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
    content_type?: string;
    hero_image_url?: string | null;
    author_label?: string | null;
    comment_enabled?: boolean;
    is_active?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
  };
  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 20000);
  if (!title || !text) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const contentType = parseCustomerCenterContentType(body.content_type, "notice");
  const hero = normalizeCustomerCenterHeroImageUrl(body.hero_image_url);
  const authorOverride = typeof body.author_label === "string" ? body.author_label.trim() : "";
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("app_notices")
    .insert({
      title,
      body: text,
      content_type: contentType,
      hero_image_url: hero,
      author_label: authorOverride || null,
      comment_enabled: body.comment_enabled !== false,
      is_active: body.is_active !== false,
      starts_at: body.starts_at?.trim() || null,
      ends_at: body.ends_at?.trim() || null,
      published_at: now,
      created_by: admin.userId,
      created_at: now,
      updated_at: now,
    })
    .select(APP_NOTICES_CONTENT_SELECT)
    .single();

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json(
        {
          ok: false,
          error: "table_missing",
          hint: "Apply migrations 20261018120000_app_notices + 20261030120000_app_notices_customer_center_content_ssot",
        },
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
    canonicalHref: buildCustomerCenterBoardDetailPath(contentType, id),
  });
}

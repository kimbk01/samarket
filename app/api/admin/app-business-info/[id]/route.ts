/**
 * GET/PATCH /api/admin/app-business-info/[id]
 */
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  APP_BUSINESS_INFO_SELECT,
  isAppBusinessLocale,
  isMissingAppPlatformBusinessInfoTableError,
  normalizeAppPlatformBusinessInfoRow,
  type AppBusinessStatus,
} from "@/lib/business/app-platform-business-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const docId = id?.trim();
  if (!docId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("app_platform_business_info")
    .select(APP_BUSINESS_INFO_SELECT)
    .eq("id", docId)
    .maybeSingle();

  if (error) {
    if (isMissingAppPlatformBusinessInfoTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    document: normalizeAppPlatformBusinessInfoRow(data as Record<string, unknown>),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // G-18: 앱 공통 설정 쓰기 = settings 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const { id } = await params;
  const docId = id?.trim();
  if (!docId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.locale != null) {
    if (!isAppBusinessLocale(body.locale)) {
      return NextResponse.json({ ok: false, error: "invalid_locale" }, { status: 400 });
    }
    patch.locale = body.locale;
  }
  if (body.companyName != null || body.company_name != null) {
    patch.company_name = String(body.companyName ?? body.company_name ?? "").trim().slice(0, 200);
  }
  if (body.representativeName != null || body.representative_name != null) {
    patch.representative_name = String(body.representativeName ?? body.representative_name ?? "")
      .trim()
      .slice(0, 200);
  }
  if (body.registrationNumber != null || body.registration_number != null) {
    patch.registration_number = String(body.registrationNumber ?? body.registration_number ?? "")
      .trim()
      .slice(0, 100);
  }
  if (body.mailOrderNumber != null || body.mail_order_number != null) {
    patch.mail_order_number = String(body.mailOrderNumber ?? body.mail_order_number ?? "")
      .trim()
      .slice(0, 100);
  }
  if (body.address != null) patch.address = String(body.address).trim().slice(0, 500);
  if (body.email != null) patch.email = String(body.email).trim().slice(0, 200);
  if (body.phone != null) patch.phone = String(body.phone).trim().slice(0, 50);
  if (body.version != null) patch.version = String(body.version).trim().slice(0, 64);
  if (body.status != null) {
    const status: AppBusinessStatus = body.status === "published" ? "published" : "draft";
    patch.status = status;
    if (status === "published") patch.published_at = new Date().toISOString();
  }

  const { data: beforeRow } = await sb
    .from("app_platform_business_info")
    .select(APP_BUSINESS_INFO_SELECT)
    .eq("id", docId)
    .maybeSingle();

  const { data, error } = await sb
    .from("app_platform_business_info")
    .update(patch)
    .eq("id", docId)
    .select(APP_BUSINESS_INFO_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingAppPlatformBusinessInfoTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "app_platform_business_info",
    targetId: docId,
    action: "app_business_info.update",
    before: (beforeRow as Record<string, unknown> | null) ?? null,
    after: data as Record<string, unknown>,
  });
  return NextResponse.json({
    ok: true,
    document: normalizeAppPlatformBusinessInfoRow(data as Record<string, unknown>),
  });
}

/**
 * GET/POST /api/admin/app-business-info — Admin Business CMS (Slice 8 Phase 2)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_BUSINESS_INFO_SELECT,
  isAppBusinessLocale,
  isMissingAppPlatformBusinessInfoTableError,
  normalizeAppPlatformBusinessInfoRow,
  type AppBusinessStatus,
} from "@/lib/business/app-platform-business-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("app_platform_business_info")
    .select(APP_BUSINESS_INFO_SELECT)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingAppPlatformBusinessInfoTableError(error.message ?? "")) {
      return NextResponse.json({ ok: true, documents: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const documents = (data ?? [])
    .map((row) => normalizeAppPlatformBusinessInfoRow(row as Record<string, unknown>))
    .filter(Boolean);

  return NextResponse.json({ ok: true, documents });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isAppBusinessLocale(body.locale)) {
    return NextResponse.json({ ok: false, error: "invalid_locale" }, { status: 400 });
  }
  const companyName = String(body.companyName ?? body.company_name ?? "").trim().slice(0, 200);
  const version = String(body.version ?? "").trim().slice(0, 64) || "1";
  if (!companyName) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const status: AppBusinessStatus = body.status === "published" ? "published" : "draft";
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("app_platform_business_info")
    .insert({
      locale: body.locale,
      company_name: companyName,
      representative_name: String(body.representativeName ?? body.representative_name ?? "").trim().slice(0, 200),
      registration_number: String(body.registrationNumber ?? body.registration_number ?? "").trim().slice(0, 100),
      mail_order_number: String(body.mailOrderNumber ?? body.mail_order_number ?? "").trim().slice(0, 100),
      address: String(body.address ?? "").trim().slice(0, 500),
      email: String(body.email ?? "").trim().slice(0, 200),
      phone: String(body.phone ?? "").trim().slice(0, 50),
      version,
      status,
      published_at: status === "published" ? now : null,
      created_at: now,
      updated_at: now,
    })
    .select(APP_BUSINESS_INFO_SELECT)
    .single();

  if (error) {
    if (isMissingAppPlatformBusinessInfoTableError(error.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: "table_missing", hint: "Apply migration 20261019130000_app_platform_business_info" },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    document: normalizeAppPlatformBusinessInfoRow(data as Record<string, unknown>),
  });
}

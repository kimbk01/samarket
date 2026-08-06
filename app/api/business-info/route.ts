/**
 * GET /api/business-info — public Platform Business Info reader (Guest/Member).
 * Query: locale=ko|en
 */
import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_BUSINESS_INFO_SELECT,
  isAppBusinessLocale,
  isMissingAppPlatformBusinessInfoTableError,
  normalizeAppPlatformBusinessInfoRow,
  pickPublishedBusinessInfo,
  type AppBusinessLocale,
  type AppPlatformBusinessInfoRow,
} from "@/lib/business/app-platform-business-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const localeParam = req.nextUrl.searchParams.get("locale") ?? "ko";
  const locale: AppBusinessLocale = isAppBusinessLocale(localeParam) ? localeParam : "ko";

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("app_platform_business_info")
    .select(APP_BUSINESS_INFO_SELECT)
    .eq("locale", locale)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    if (isMissingAppPlatformBusinessInfoTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing", document: null }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? [])
    .map((row) => normalizeAppPlatformBusinessInfoRow(row as Record<string, unknown>))
    .filter(Boolean) as AppPlatformBusinessInfoRow[];

  return NextResponse.json({
    ok: true,
    locale,
    document: pickPublishedBusinessInfo(rows),
    source: "app_platform_business_info",
  });
}

/**
 * GET /api/legal/[kind] — public Legal CMS reader (Guest/Member).
 * Query: locale=ko|en (default ko)
 */
import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_LEGAL_DOCUMENT_SELECT,
  isAppLegalKind,
  isAppLegalLocale,
  isMissingAppLegalDocumentsTableError,
  normalizeAppLegalDocumentRow,
  pickCurrentPublishedLegalDoc,
  type AppLegalDocumentRow,
  type AppLegalLocale,
} from "@/lib/legal/app-legal-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind: kindRaw } = await params;
  if (!isAppLegalKind(kindRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }

  const localeParam = req.nextUrl.searchParams.get("locale") ?? "ko";
  const locale: AppLegalLocale = isAppLegalLocale(localeParam) ? localeParam : "ko";

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .eq("kind", kindRaw)
    .eq("locale", locale)
    .eq("status", "published")
    .order("effective_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing", document: null }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? [])
    .map((row) => normalizeAppLegalDocumentRow(row as Record<string, unknown>))
    .filter(Boolean) as AppLegalDocumentRow[];
  const document = pickCurrentPublishedLegalDoc(rows);

  return NextResponse.json({
    ok: true,
    kind: kindRaw,
    locale,
    document,
    source: "app_legal_documents",
  });
}

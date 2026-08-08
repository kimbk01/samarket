/**
 * GET/POST /api/admin/app-legal-documents — Admin Legal CMS (Slice 8 Phase 1)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_LEGAL_DOCUMENT_SELECT,
  isAppLegalKind,
  isAppLegalLocale,
  isMissingAppLegalDocumentsTableError,
  normalizeAppLegalDocumentRow,
  type AppLegalStatus,
} from "@/lib/legal/app-legal-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) {
      return NextResponse.json({ ok: true, documents: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const documents = (data ?? [])
    .map((row) => normalizeAppLegalDocumentRow(row as Record<string, unknown>))
    .filter(Boolean);

  return NextResponse.json({ ok: true, documents });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    locale?: string;
    title?: string;
    body?: string;
    version?: string;
    status?: string;
    effective_at?: string | null;
  };

  if (!isAppLegalKind(body.kind) || !isAppLegalLocale(body.locale)) {
    return NextResponse.json({ ok: false, error: "invalid_kind_or_locale" }, { status: 400 });
  }
  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 100000);
  const version = String(body.version ?? "").trim().slice(0, 64);
  if (!title || !text || !version) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const status: AppLegalStatus = body.status === "published" ? "published" : "draft";
  const now = new Date().toISOString();
  const effectiveAt = body.effective_at?.trim() || (status === "published" ? now : null);

  const { data, error } = await sb
    .from("app_legal_documents")
    .insert({
      kind: body.kind,
      locale: body.locale,
      title,
      body: text,
      version,
      status,
      effective_at: effectiveAt,
      published_at: status === "published" ? now : null,
      created_at: now,
      updated_at: now,
    })
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .single();

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: "table_missing", hint: "Apply migration 20261019120000_app_legal_documents" },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { clearRequiredConsentVersionsCache } = await import(
    "@/lib/legal/resolve-required-consent-versions"
  );
  clearRequiredConsentVersionsCache();

  return NextResponse.json({
    ok: true,
    document: normalizeAppLegalDocumentRow(data as Record<string, unknown>),
  });
}

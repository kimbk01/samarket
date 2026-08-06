/**
 * GET/PATCH /api/admin/app-legal-documents/[id]
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const docId = id?.trim();
  if (!docId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .eq("id", docId)
    .maybeSingle();

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    document: normalizeAppLegalDocumentRow(data as Record<string, unknown>),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const docId = id?.trim();
  if (!docId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.kind != null) {
    if (!isAppLegalKind(body.kind)) {
      return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
    }
    patch.kind = body.kind;
  }
  if (body.locale != null) {
    if (!isAppLegalLocale(body.locale)) {
      return NextResponse.json({ ok: false, error: "invalid_locale" }, { status: 400 });
    }
    patch.locale = body.locale;
  }
  if (body.title != null) patch.title = String(body.title).trim().slice(0, 200);
  if (body.body != null) patch.body = String(body.body).trim().slice(0, 100000);
  if (body.version != null) patch.version = String(body.version).trim().slice(0, 64);
  if (body.effective_at !== undefined) {
    patch.effective_at = body.effective_at?.trim() || null;
  }
  if (body.status != null) {
    const status: AppLegalStatus = body.status === "published" ? "published" : "draft";
    patch.status = status;
    if (status === "published") {
      patch.published_at = new Date().toISOString();
      if (!patch.effective_at) patch.effective_at = patch.published_at;
    }
  }

  const { data, error } = await sb
    .from("app_legal_documents")
    .update(patch)
    .eq("id", docId)
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    document: normalizeAppLegalDocumentRow(data as Record<string, unknown>),
  });
}

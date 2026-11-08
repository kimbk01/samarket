/**
 * GET/PATCH /api/admin/app-legal-documents/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  evaluateLegalDocumentPatch,
  isLegalVersionConflictError,
  isMissingConsentRequirementColumnError,
  isPublishedLegalImmutableError,
  legalDocAuditSnapshot,
  type LegalDocPatchInput,
} from "@/lib/legal/app-legal-document-edit-policy";
import { withLegalConsentRequirement } from "@/lib/legal/legal-document-consent-requirement.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_LEGAL_DOCUMENT_SELECT,
  isMissingAppLegalDocumentsTableError,
  normalizeAppLegalDocumentRow,
} from "@/lib/legal/app-legal-documents";
import { adminServerText } from "@/lib/i18n/admin-server-language";

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

  const row = normalizeAppLegalDocumentRow(data as Record<string, unknown>);
  const [document] = row ? await withLegalConsentRequirement(sb, [row]) : [row];
  return NextResponse.json({ ok: true, document });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Legal text is member-facing contract: writes need the operations-settings permission
  // (super admin always passes) — not merely any admin session.
  const admin = await requireAdminPermission("settings");
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

  const input = (await req.json().catch(() => ({}))) as LegalDocPatchInput;

  const { data: currentRaw, error: readError } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .eq("id", docId)
    .maybeSingle();
  if (readError) {
    if (isMissingAppLegalDocumentsTableError(readError.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }
  const current = currentRaw ? normalizeAppLegalDocumentRow(currentRaw as Record<string, unknown>) : null;
  if (!current) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const decision = evaluateLegalDocumentPatch(current, input);
  if (!decision.ok) {
    return NextResponse.json(
      { ok: false, error: decision.error, message: decision.message },
      { status: decision.status },
    );
  }

  const { data, error } = await sb
    .from("app_legal_documents")
    .update(decision.patch)
    .eq("id", docId)
    .eq("updated_at", current.updated_at)
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    if (isLegalVersionConflictError(error)) {
      return NextResponse.json(
        { ok: false, error: "version_conflict", message: await adminServerText("admin_api_legal_version_conflict") },
        { status: 409 },
      );
    }
    if (isPublishedLegalImmutableError(error)) {
      return NextResponse.json(
        { ok: false, error: "published_text_immutable", message: await adminServerText("admin_api_legal_published_immutable") },
        { status: 409 },
      );
    }
    if (isMissingConsentRequirementColumnError(error)) {
      return NextResponse.json(
        { ok: false, error: "consent_requirement_unavailable", message: await adminServerText("admin_api_legal_consent_unavailable") },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    // updated_at compare-and-set lost: someone else changed the document meanwhile.
    return NextResponse.json(
      { ok: false, error: "stale_document", message: await adminServerText("admin_api_legal_stale") },
      { status: 409 },
    );
  }

  const normalized = normalizeAppLegalDocumentRow(data as Record<string, unknown>);
  const [updated] = normalized ? await withLegalConsentRequirement(sb, [normalized]) : [normalized];
  const { clearRequiredConsentVersionsCache } = await import(
    "@/lib/legal/resolve-required-consent-versions"
  );
  clearRequiredConsentVersionsCache();

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.actor.userId,
    target_type: "app_legal_document",
    target_id: docId,
    action: `legal_document.${decision.action}`,
    before_json: legalDocAuditSnapshot(current),
    after_json: legalDocAuditSnapshot(updated),
  });

  return NextResponse.json({ ok: true, action: decision.action, document: updated });
}

/**
 * Server reader for published Legal CMS docs (terms/privacy).
 * Guest-safe — service client, published only.
 */
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_LEGAL_DOCUMENT_SELECT,
  isMissingAppLegalDocumentsTableError,
  normalizeAppLegalDocumentRow,
  pickCurrentPublishedLegalDoc,
  type AppLegalDocumentRow,
  type AppLegalKind,
  type AppLegalLocale,
} from "@/lib/legal/app-legal-documents";

export async function loadPublishedAppLegalDocument(
  kind: AppLegalKind,
  locale: AppLegalLocale,
): Promise<AppLegalDocumentRow | null> {
  const result = await loadPublishedAppLegalDocumentResult(kind, locale);
  return result.ok ? result.row : null;
}

/**
 * Same read as `loadPublishedAppLegalDocument`, but a read failure is reported (`ok:false`)
 * instead of being folded into "no published row". Consent authority must not treat a
 * failed CMS read as "fallback version is current" (fail-open).
 */
export type PublishedLegalDocumentResult =
  | { ok: true; row: AppLegalDocumentRow | null }
  | { ok: false; reason: "service_unconfigured" | "read_failed" };

export async function loadPublishedAppLegalDocumentResult(
  kind: AppLegalKind,
  locale: AppLegalLocale,
): Promise<PublishedLegalDocumentResult> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return { ok: false, reason: "service_unconfigured" };

  const { data, error } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .eq("kind", kind)
    .eq("locale", locale)
    .eq("status", "published")
    .order("effective_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) return { ok: true, row: null };
    return { ok: false, reason: "read_failed" };
  }

  const rows = (data ?? [])
    .map((row) => normalizeAppLegalDocumentRow(row as Record<string, unknown>))
    .filter(Boolean) as AppLegalDocumentRow[];
  return { ok: true, row: pickCurrentPublishedLegalDoc(rows) };
}

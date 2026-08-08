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
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .eq("kind", kind)
    .eq("locale", locale)
    .eq("status", "published")
    .order("effective_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) return null;
    return null;
  }

  const rows = (data ?? [])
    .map((row) => normalizeAppLegalDocumentRow(row as Record<string, unknown>))
    .filter(Boolean) as AppLegalDocumentRow[];
  return pickCurrentPublishedLegalDoc(rows);
}

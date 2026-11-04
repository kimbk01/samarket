import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLegalDocumentRow } from "@/lib/legal/app-legal-documents";

/**
 * Adds `consent_requirement` (terms/privacy revision type) to Admin rows.
 * Read separately from APP_LEGAL_DOCUMENT_SELECT so member/legal readers keep working before
 * migration 20271106120000; a failed read leaves the rows unchanged.
 */
export async function withLegalConsentRequirement(
  sb: SupabaseClient,
  rows: AppLegalDocumentRow[],
): Promise<AppLegalDocumentRow[]> {
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return rows;
  try {
    const { data, error } = await sb
      .from("app_legal_documents")
      .select("id, consent_requirement")
      .in("id", ids);
    if (error || !Array.isArray(data)) return rows;
    const byId = new Map<string, "reconsent" | "notice">();
    for (const r of data as Array<{ id?: unknown; consent_requirement?: unknown }>) {
      if (r.consent_requirement === "reconsent" || r.consent_requirement === "notice") {
        byId.set(String(r.id), r.consent_requirement);
      }
    }
    return rows.map((r) => (byId.has(r.id) ? { ...r, consent_requirement: byId.get(r.id) } : r));
  } catch {
    return rows;
  }
}

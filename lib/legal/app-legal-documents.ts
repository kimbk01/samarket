/**
 * Slice 8 Phase 1 — Legal CMS helpers (terms + privacy).
 * Writer = Admin CMS APIs. Reader = public GET /privacy|/terms.
 * Consent required versions resolve from published ko CMS `version`
 * (see resolve-required-consent-versions); STORE_* is fallback only.
 * New CMS version string publish ⇒ member re-consent; same-version body edit does not.
 */

export const APP_LEGAL_KINDS = ["terms", "privacy"] as const;
export type AppLegalKind = (typeof APP_LEGAL_KINDS)[number];

export const APP_LEGAL_LOCALES = ["ko", "en"] as const;
export type AppLegalLocale = (typeof APP_LEGAL_LOCALES)[number];

export const APP_LEGAL_STATUSES = ["draft", "published"] as const;
export type AppLegalStatus = (typeof APP_LEGAL_STATUSES)[number];

export const APP_LEGAL_DOCUMENT_SELECT =
  "id, kind, locale, title, body, version, status, effective_at, published_at, created_at, updated_at";

export type AppLegalDocumentRow = {
  id: string;
  kind: AppLegalKind;
  locale: AppLegalLocale;
  title: string;
  body: string;
  version: string;
  status: AppLegalStatus;
  effective_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isAppLegalKind(v: unknown): v is AppLegalKind {
  return v === "terms" || v === "privacy";
}

export function isAppLegalLocale(v: unknown): v is AppLegalLocale {
  return v === "ko" || v === "en";
}

export function isMissingAppLegalDocumentsTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("app_legal_documents") &&
    (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))
  );
}

export function splitLegalBodyParagraphs(body: string): string[] {
  return String(body ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function normalizeAppLegalDocumentRow(row: Record<string, unknown>): AppLegalDocumentRow | null {
  const id = String(row.id ?? "").trim();
  const kind = String(row.kind ?? "").trim();
  const locale = String(row.locale ?? "").trim();
  if (!id || !isAppLegalKind(kind) || !isAppLegalLocale(locale)) return null;
  const statusRaw = String(row.status ?? "draft").trim();
  const status: AppLegalStatus = statusRaw === "published" ? "published" : "draft";
  return {
    id,
    kind,
    locale,
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    version: String(row.version ?? ""),
    status,
    effective_at: row.effective_at != null ? String(row.effective_at) : null,
    published_at: row.published_at != null ? String(row.published_at) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Pick newest effective published doc (caller already filtered status=published). */
export function pickCurrentPublishedLegalDoc(
  rows: AppLegalDocumentRow[],
  nowMs: number = Date.now(),
): AppLegalDocumentRow | null {
  const eligible = rows.filter((r) => {
    if (r.status !== "published") return false;
    if (!r.effective_at) return true;
    const t = Date.parse(r.effective_at);
    return Number.isFinite(t) ? t <= nowMs : true;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    const ae = a.effective_at ? Date.parse(a.effective_at) : 0;
    const be = b.effective_at ? Date.parse(b.effective_at) : 0;
    if (be !== ae) return be - ae;
    const ap = a.published_at ? Date.parse(a.published_at) : 0;
    const bp = b.published_at ? Date.parse(b.published_at) : 0;
    return bp - ap;
  });
  return eligible[0] ?? null;
}

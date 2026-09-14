/**
 * Article language SSOT — catalog defaultLanguage is fallback only, not article truth.
 * CUT A: translation_status writers may only emit unsupported | none (no draft_ko).
 */

export type SourceLanguageCode = "en" | "fil" | "tl" | "ceb" | "ko" | "other";

export type TranslationStatus = "unsupported" | "none" | "draft_ko";

export type WritableTranslationStatus = "unsupported" | "none";

export const TRANSLATION_STATUS_DEFAULT: WritableTranslationStatus = "unsupported";

export function languageDisplayLabel(code: string | null | undefined): string {
  if (code == null || !String(code).trim()) return "미확인";
  const c = String(code).trim().toLowerCase();
  if (c === "en") return "영어";
  if (c === "fil" || c === "tl") return "필리핀어";
  if (c === "ceb") return "세부아노";
  if (c === "ko") return "한국어";
  if (c === "other") return "기타";
  return "기타";
}

/**
 * Resolve source_language for an article.
 * Authority: explicit → adapter deterministic → catalog default → null.
 * Never fabricates detected_language.
 */
export function resolveArticleSourceLanguage(input: {
  explicit?: string | null;
  adapterDeterministic?: string | null;
  catalogDefault?: string | null;
}): string | null {
  const explicit = String(input.explicit ?? "").trim();
  if (explicit) return explicit;
  const adapter = String(input.adapterDeterministic ?? "").trim();
  if (adapter) return adapter;
  const fallback = String(input.catalogDefault ?? "").trim();
  if (fallback) return fallback;
  return null;
}

/** CUT A write guard — draft_ko has no writer. */
export function assertWritableTranslationStatus(
  value: string | null | undefined
): WritableTranslationStatus {
  if (value === "none") return "none";
  if (value === "unsupported" || value == null || value === "") return "unsupported";
  throw Object.assign(new Error("translation_status draft_ko is not writable in CUT A"), {
    failureCode: "translation_write_forbidden",
  });
}

export function normalizeWritableTranslationStatus(
  value: string | null | undefined
): WritableTranslationStatus {
  try {
    return assertWritableTranslationStatus(value);
  } catch {
    return "unsupported";
  }
}

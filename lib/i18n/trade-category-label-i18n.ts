import type { AppLanguageCode } from "./config";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { humanizeMessageKeySlug, sanitizeUiDisplayLabel } from "./safe-ui-label";

/** 거래 홈 1·2행 탭·칩 — `categories.name` / `name_en` (어드민 UI 표시명) */
export function resolveTradeCategoryUILabel(
  lang: AppLanguageCode,
  koName: string,
  nameEn?: string | null,
  slugFallback?: string
): string {
  const fb = humanizeMessageKeySlug(slugFallback ?? koName);
  const admin = resolveLocalizedAdminLabel(lang, koName, nameEn);
  return sanitizeUiDisplayLabel(admin, fb);
}

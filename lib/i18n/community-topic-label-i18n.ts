import type { AppLanguageCode } from "./config";
import {
  getNeighborhoodCategoryLabel,
  normalizeNeighborhoodCategory,
} from "@/lib/neighborhood/categories";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { humanizeMessageKeySlug, sanitizeUiDisplayLabel } from "./safe-ui-label";

/**
 * 피드 탭·카드 주제 뱃지 UI 라벨 (게시글 본문 아님)
 *
 * DISPLAY AUTHORITY (Community Topic SSOT):
 * - EN: name_en → Admin name (koName/label) → slug humanize
 * - KO: Admin name → name_en → slug humanize
 * DO NOT prefer slug humanize over Admin-managed name when name_en is null.
 */
export function resolveCommunityTopicUILabel(
  lang: AppLanguageCode,
  koName: string,
  enName?: string | null,
  slugFallback?: string
): string {
  const slug = (slugFallback ?? "").trim().toLowerCase();
  const ko = (koName ?? "").trim();
  const en = (enName ?? "").trim();
  const legacy = normalizeNeighborhoodCategory(slug);
  const fb =
    lang === "en" && legacy
      ? getNeighborhoodCategoryLabel(legacy, "en")
      : humanizeMessageKeySlug(slug || ko);
  const localized = resolveLocalizedAdminLabel(lang, ko, en).trim();
  const canonical = lang === "en" ? ko : en;
  const raw = localized || canonical || fb;
  return sanitizeUiDisplayLabel(raw, fb);
}

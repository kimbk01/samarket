import type { AppLanguageCode } from "./config";
import {
  getNeighborhoodCategoryLabel,
  normalizeNeighborhoodCategory,
} from "@/lib/neighborhood/categories";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { humanizeMessageKeySlug, sanitizeUiDisplayLabel } from "./safe-ui-label";

/** 피드 탭·카드 주제 뱃지 UI 라벨 (게시글 본문 아님) */
export function resolveCommunityTopicUILabel(
  lang: AppLanguageCode,
  koName: string,
  enName?: string | null,
  slugFallback?: string
): string {
  const slug = (slugFallback ?? "").trim().toLowerCase();
  const legacy = normalizeNeighborhoodCategory(slug);
  const fb =
    lang === "en" && legacy
      ? getNeighborhoodCategoryLabel(legacy, "en")
      : humanizeMessageKeySlug(slug || koName);
  const admin = resolveLocalizedAdminLabel(lang, koName, enName);
  const raw =
    admin.trim() ||
    (lang === "en" ? (enName ?? "").trim() || fb : koName.trim() || fb);
  return sanitizeUiDisplayLabel(raw, fb);
}

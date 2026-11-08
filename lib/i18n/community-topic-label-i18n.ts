import type { AppLanguageCode } from "./config";
import {
  getNeighborhoodCategoryLabel,
  normalizeNeighborhoodCategory,
} from "@/lib/neighborhood/categories";
import { translate } from "./messages";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { sanitizeUiDisplayLabel } from "./safe-ui-label";

/**
 * 피드 탭·카드 주제 뱃지 UI 라벨 (게시글 본문 아님)
 *
 * DISPLAY AUTHORITY (`docs/i18n-ssot.md` §3 — 다른 언어로 대체 금지):
 * - EN: name_en → 동네 카테고리 slug 카탈로그 키 → 「Topic」
 * - KO: 어드민 이름 → 동네 카테고리 slug 카탈로그 키 → 「주제」
 * - 반대 언어 이름(ko 이름을 영어 화면에, name_en 을 한국어 화면에)과 slug 를 펼친 영어는 쓰지 않는다.
 *   영어 이름이 비어 있으면 어드민에서 name_en 을 입력해야 한다(설계 S7).
 */
export function resolveCommunityTopicUILabel(
  lang: AppLanguageCode,
  koName: string,
  enName?: string | null,
  slugFallback?: string
): string {
  const legacy = normalizeNeighborhoodCategory((slugFallback ?? "").trim().toLowerCase());
  const fb = legacy
    ? getNeighborhoodCategoryLabel(legacy, lang)
    : translate(lang, "community_topic_label_fallback");
  const localized = resolveLocalizedAdminLabel(lang, (koName ?? "").trim(), enName).trim();
  return sanitizeUiDisplayLabel(localized, fb);
}

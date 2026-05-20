import type { AppLanguageCode } from "./config";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";

/** 피드 탭·카드 주제 뱃지 UI 라벨 (게시글 본문 아님) */
export function resolveCommunityTopicUILabel(
  lang: AppLanguageCode,
  koName: string,
  enName?: string | null
): string {
  return resolveLocalizedAdminLabel(lang, koName, enName);
}

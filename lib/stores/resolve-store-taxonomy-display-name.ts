import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  resolveStorePrimaryIndustryLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";

/** 입점 신청·매장 설정 — `/stores` 배달 UI 와 동일 1차 업종 라벨 */
export function resolveStoreTaxonomyPrimaryDisplayName(
  lang: AppLanguageCode,
  slug: string,
  nameKo: string,
  nameEn?: string | null,
): string {
  return resolveStorePrimaryIndustryLabel(lang, slug, nameKo, nameEn);
}

/** 입점 신청·매장 설정 — `/stores` 배달 UI 와 동일 2차 업종 라벨 */
export function resolveStoreTaxonomyTopicDisplayName(
  lang: AppLanguageCode,
  slug: string,
  nameKo: string,
  nameEn?: string | null,
): string {
  return resolveStoreTopicLabel(lang, slug, nameKo, nameEn);
}

/** @deprecated primary/topic 전용 함수 사용 */
export function resolveStoreTaxonomyDisplayName(
  lang: AppLanguageCode,
  primaryName: string,
  nameEn?: string | null,
  slug?: string | null,
): string {
  const slugKey = String(slug ?? "").trim();
  if (slugKey) {
    return resolveStoreTaxonomyPrimaryDisplayName(lang, slugKey, primaryName, nameEn);
  }
  return resolveStorePrimaryIndustryLabel(lang, "", primaryName, nameEn);
}

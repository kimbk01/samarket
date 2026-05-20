import type { AppLanguageCode } from "@/lib/i18n/config";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";

const LEGACY_UNCATEGORIZED_HEADINGS = new Set([
  "기타 메뉴",
  "Other menu",
  "Other",
]);

/** DB·캐시에 남은 한국어 기본 구역명 → 현재 `locale` 라벨 */
export function localizeMenuSectionHeadings(
  sections: MenuSection[],
  lang: AppLanguageCode
): MenuSection[] {
  const uncategorized = safeTranslate(lang, "store_menu_uncategorized", {
    fallbackKo: "기타 메뉴",
    fallbackEn: "Other menu",
  });
  return sections.map((s) => {
    const h = s.heading.trim();
    const isUncategorized =
      s.sectionId === null || LEGACY_UNCATEGORIZED_HEADINGS.has(h);
    return isUncategorized ? { ...s, heading: uncategorized } : s;
  });
}

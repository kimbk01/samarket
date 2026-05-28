import type { AppLanguageCode } from "./config";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { resolveTradeWriteSkinKey } from "@/lib/trade/resolve-trade-write-skin-key";
import { TRADE_SKIN_MESSAGE_KEYS } from "@/lib/types/category-label-i18n";
import type { MessageKey } from "./messages";
import { translate } from "./messages";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { humanizeMessageKeySlug, sanitizeUiDisplayLabel } from "./safe-ui-label";

/** 거래 루트·글쓰기 런처 — `icon_key` / slug 힌트 → catalog (en, `name_en` 없을 때) */
const TRADE_ICON_MESSAGE_KEYS: Record<string, MessageKey> = {
  market: "cat_trade_market",
  general: "cat_skin_general",
  "used-car": "cat_skin_used_car",
  car: "cat_skin_used_car",
  "real-estate": "cat_skin_real_estate",
  jobs: "cat_trade_jobs_listing",
  job: "cat_trade_jobs_listing",
  exchange: "cat_trade_exchange_listing",
};

function catalogLabelForTradeIcon(lang: AppLanguageCode, iconKey: string | null | undefined, slug?: string): string {
  const rawIcon = (iconKey ?? "").trim();
  const skin = resolveTradeWriteSkinKey(rawIcon);
  const slugToken = (slug ?? "").trim().toLowerCase();
  const key =
    TRADE_ICON_MESSAGE_KEYS[rawIcon] ??
    TRADE_ICON_MESSAGE_KEYS[skin] ??
    TRADE_SKIN_MESSAGE_KEYS[skin] ??
    (slugToken ? TRADE_ICON_MESSAGE_KEYS[slugToken] : undefined);
  if (!key) return "";
  return translate(lang, key);
}

/** 거래 홈 1·2행 탭·칩·글쓰기 카테고리 — `categories.name` / `name_en` (어드민 UI 표시명) */
export function resolveTradeCategoryUILabel(
  lang: AppLanguageCode,
  koName: string,
  nameEn?: string | null,
  slugFallback?: string,
  iconKey?: string | null
): string {
  const fb = humanizeMessageKeySlug(slugFallback ?? koName);
  const admin = resolveLocalizedAdminLabel(lang, koName, nameEn);
  if (admin.trim()) {
    return sanitizeUiDisplayLabel(admin, fb);
  }
  if (lang === "en") {
    const fromCatalog = catalogLabelForTradeIcon(lang, iconKey, slugFallback);
    if (fromCatalog.trim()) {
      return sanitizeUiDisplayLabel(fromCatalog, fb);
    }
    return sanitizeUiDisplayLabel(fb, fb);
  }
  return sanitizeUiDisplayLabel(koName.trim() || fb, fb);
}

/** `/write`·거래 글쓰기 시트 — 타입별 카테고리 표시명 */
export function resolveWriteCategoryUILabel(
  lang: AppLanguageCode,
  category: Pick<CategoryWithSettings, "name" | "name_en" | "slug" | "icon_key" | "type">
): string {
  if (category.type === "trade") {
    return resolveTradeCategoryUILabel(
      lang,
      category.name,
      category.name_en,
      category.slug,
      category.icon_key
    );
  }
  const fb = humanizeMessageKeySlug(category.slug ?? category.name);
  const admin = resolveLocalizedAdminLabel(lang, category.name, category.name_en);
  const raw =
    admin.trim() ||
    (lang === "en" ? (category.name_en ?? "").trim() || fb : category.name.trim() || fb);
  return sanitizeUiDisplayLabel(raw, fb);
}

/**
 * Product recovery — HOME shelf resolved product config (catalog + DB override merge).
 */

import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
  StoresHomeShelfProductDefinition,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import {
  STORES_HOME_SHELF_PRODUCT_CATALOG,
  canonicalizeHomeShelfId,
  shelfIdToComposerSlot,
  storesHomeShelfByComposerSlot,
  storesHomeShelfById,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import {
  coercePresentationForDataSource,
  defaultDataSourceForSlot,
  parseStoresHomeDataSource,
  type StoresHomeDataSourceId,
} from "@/lib/stores/product/stores-home-data-source";
import type { StoresHomeShelfProductConfig } from "@/lib/stores/product/stores-home-shelf-product-config";
import {
  mergeHomeShelfProductConfig,
  parseHomeShelfProductConfig,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";

export type StoresHomeShelfProductOverride = {
  shelfId: string;
  /** DB row slot — 같은 선반으로 모이는 행이 여럿일 때 그 선반 자기 슬롯 행을 고른다 (H-02). */
  slot?: string | null;
  enabled?: boolean;
  order?: number;
  max?: number | null;
  titleKo?: string | null;
  titleEn?: string | null;
  subtitleKo?: string | null;
  subtitleEn?: string | null;
  presentation?: StoresHomePresentationPatternId | null;
  couponIntegration?: StoresHomeShelfCouponIntegration;
  adIntegration?: StoresHomeShelfAdIntegration;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  productConfig?: Partial<StoresHomeShelfProductConfig>;
};

export type StoresHomeShelfResolvedConfig = {
  shelfId: string;
  composerSlot: StoresHomeCompositionSlotKey | null;
  availability: StoresHomeShelfProductDefinition["availability"];
  unavailableReasonKo: string | null;
  unavailableReasonEn: string | null;
  enabled: boolean;
  order: number;
  max: number | null;
  titleKo: string;
  titleEn: string;
  subtitleKo: string | null;
  subtitleEn: string | null;
  presentation: StoresHomePresentationPatternId;
  dataSource: StoresHomeDataSourceId;
  couponIntegration: StoresHomeShelfCouponIntegration;
  adIntegration: StoresHomeShelfAdIntegration;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  customerVisible: boolean;
  supportsCouponIntegration: boolean;
  supportsAdIntegration: boolean;
  productConfig: StoresHomeShelfProductConfig;
};

/** H-07 — 저장된 빈 문자열 = 부제 없음, 저장값 없음(null) = 카탈로그 기본 부제. */
function resolveShelfSubtitleField(saved: string | null | undefined, fallback: string | null | undefined): string | null {
  if (typeof saved === "string") return saved.trim() || null;
  return fallback || null;
}

function mergeShelf(
  def: StoresHomeShelfProductDefinition,
  override: StoresHomeShelfProductOverride | undefined
): StoresHomeShelfResolvedConfig {
  const unavailable = def.availability === "unavailable";
  const enabled = unavailable ? false : (override?.enabled ?? true);
  const productConfig = mergeHomeShelfProductConfig(def.defaultProductConfig, override?.productConfig);
  const dataSource = parseStoresHomeDataSource(
    productConfig.dataSource,
    defaultDataSourceForSlot(def.composerSlot ?? null)
  );
  const rawPresentation = override?.presentation ?? def.defaultPresentation;
  return {
    shelfId: def.shelfId,
    composerSlot: def.composerSlot ?? null,
    availability: def.availability,
    unavailableReasonKo: def.unavailableReasonKo ?? null,
    unavailableReasonEn: def.unavailableReasonEn ?? null,
    enabled,
    order: override?.order ?? def.defaultOrder,
    max: override?.max !== undefined ? override.max : def.defaultMax,
    titleKo: override?.titleKo?.trim() || def.defaultTitleKo,
    titleEn: override?.titleEn?.trim() || def.defaultTitleEn,
    subtitleKo: resolveShelfSubtitleField(override?.subtitleKo, def.defaultSubtitleKo),
    subtitleEn: resolveShelfSubtitleField(override?.subtitleEn, def.defaultSubtitleEn),
    presentation: coercePresentationForDataSource(dataSource, rawPresentation),
    dataSource,
    couponIntegration: override?.couponIntegration ?? "off",
    adIntegration: override?.adIntegration ?? "off",
    scheduleStart: override?.scheduleStart ?? null,
    scheduleEnd: override?.scheduleEnd ?? null,
    customerVisible:
      !unavailable &&
      enabled &&
      def.composerSlot != null &&
      isWithinProductScheduleWindow(override?.scheduleStart ?? null, override?.scheduleEnd ?? null),
    supportsCouponIntegration: def.supportsCouponIntegration,
    supportsAdIntegration: def.supportsAdIntegration,
    productConfig: { ...productConfig, dataSource },
  };
}

/**
 * 선반마다 설정 행 1개 — 다른 선반 행을 합치지 않는다 (H-02).
 * 우선순위: 그 선반 자기 슬롯 행 > 별칭(과거 id·다른 슬롯) 행. 입력 순서와 무관하게 같은 결과.
 */
function overridePreference(
  def: StoresHomeShelfProductDefinition,
  o: StoresHomeShelfProductOverride
): number {
  const ownSlot = !o.slot || def.composerSlot == null || o.slot === def.composerSlot;
  const canonicalId = o.shelfId === def.shelfId;
  return (ownSlot ? 2 : 0) + (canonicalId ? 1 : 0);
}

function pickShelfOverride(
  def: StoresHomeShelfProductDefinition,
  overrides: readonly StoresHomeShelfProductOverride[]
): StoresHomeShelfProductOverride | undefined {
  let best: StoresHomeShelfProductOverride | undefined;
  let bestScore = -1;
  for (const o of overrides) {
    if (canonicalizeHomeShelfId(o.shelfId) !== def.shelfId) continue;
    const score = overridePreference(def, o);
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best ? { ...best, shelfId: def.shelfId } : undefined;
}

export function resolveHomeShelfProductCatalog(
  overrides: readonly StoresHomeShelfProductOverride[] = []
): StoresHomeShelfResolvedConfig[] {
  return STORES_HOME_SHELF_PRODUCT_CATALOG.map((def) => mergeShelf(def, pickShelfOverride(def, overrides))).sort(
    (a, b) => a.order - b.order
  );
}

export function resolveHomeShelfForComposerSlot(
  slot: StoresHomeCompositionSlotKey,
  overrides: readonly StoresHomeShelfProductOverride[] = []
): StoresHomeShelfResolvedConfig | null {
  const def = storesHomeShelfByComposerSlot(slot);
  if (!def) return null;
  return mergeShelf(def, pickShelfOverride(def, overrides));
}

export function mapDbOverrideToShelfProduct(input: {
  slot: string;
  shelf_id?: string | null;
  enabled: boolean;
  section_order: number;
  max_items: number | null;
  title_ko?: string | null;
  title_en?: string | null;
  subtitle_ko?: string | null;
  subtitle_en?: string | null;
  presentation_mode?: string | null;
  coupon_integration?: string | null;
  ad_integration?: string | null;
  schedule_start?: string | null;
  schedule_end?: string | null;
  product_config?: unknown;
}): StoresHomeShelfProductOverride | null {
  const rawShelfId =
    input.shelf_id?.trim() ||
    (() => {
      const def = storesHomeShelfByComposerSlot(input.slot as StoresHomeCompositionSlotKey);
      return def?.shelfId ?? null;
    })();
  if (!rawShelfId) return null;
  const shelfId = canonicalizeHomeShelfId(rawShelfId);
  if (!storesHomeShelfById(shelfId)) return null;
  return {
    shelfId: rawShelfId,
    slot: input.slot,
    enabled: input.enabled,
    order: input.section_order,
    max: input.max_items,
    titleKo: input.title_ko,
    titleEn: input.title_en,
    subtitleKo: input.subtitle_ko,
    subtitleEn: input.subtitle_en,
    presentation: (input.presentation_mode as StoresHomePresentationPatternId | null) ?? undefined,
    couponIntegration: (input.coupon_integration as StoresHomeShelfCouponIntegration) ?? undefined,
    adIntegration: (input.ad_integration as StoresHomeShelfAdIntegration) ?? undefined,
    scheduleStart: input.schedule_start,
    scheduleEnd: input.schedule_end,
    productConfig: parseHomeShelfProductConfig(input.product_config),
  };
}

export function shelfProductOverrideToDbSlot(input: StoresHomeShelfProductOverride): {
  slot: string;
  shelf_id: string;
} | null {
  const slot = shelfIdToComposerSlot(input.shelfId);
  if (!slot) return null;
  return { slot, shelf_id: input.shelfId };
}

export function resolveHomeShelfTitle(
  config: StoresHomeShelfResolvedConfig,
  lang: "ko" | "en"
): string {
  return lang === "ko" ? config.titleKo : config.titleEn;
}

export function resolveHomeShelfSubtitle(
  config: StoresHomeShelfResolvedConfig,
  lang: "ko" | "en"
): string | null {
  return lang === "ko" ? config.subtitleKo : config.subtitleEn;
}

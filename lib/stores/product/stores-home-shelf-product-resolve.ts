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
    subtitleKo: override?.subtitleKo?.trim() || def.defaultSubtitleKo || null,
    subtitleEn: override?.subtitleEn?.trim() || def.defaultSubtitleEn || null,
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

export function resolveHomeShelfProductCatalog(
  overrides: readonly StoresHomeShelfProductOverride[] = []
): StoresHomeShelfResolvedConfig[] {
  const byShelf = new Map<string, StoresHomeShelfProductOverride>();
  for (const o of overrides) {
    const shelfId = canonicalizeHomeShelfId(o.shelfId);
    byShelf.set(shelfId, { ...o, shelfId });
  }
  return STORES_HOME_SHELF_PRODUCT_CATALOG.map((def) => mergeShelf(def, byShelf.get(def.shelfId))).sort(
    (a, b) => a.order - b.order
  );
}

export function resolveHomeShelfForComposerSlot(
  slot: StoresHomeCompositionSlotKey,
  overrides: readonly StoresHomeShelfProductOverride[] = []
): StoresHomeShelfResolvedConfig | null {
  const def = storesHomeShelfByComposerSlot(slot);
  if (!def) return null;
  const override = overrides.find(
    (o) => canonicalizeHomeShelfId(o.shelfId) === def.shelfId
  );
  return mergeShelf(def, override);
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
    shelfId,
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

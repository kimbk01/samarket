/**
 * DETAIL spec routing — category profile first, then legacy meta fallback.
 * Presentation authority is TradeCompositionDetailSection, not MetaBlock if-trees.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  hasExchangeMeta,
  hasJobsMeta,
  hasRealEstateMeta,
  hasRentCarMeta,
  hasUsedCarMeta,
} from "@/lib/posts/post-variant";
import { TRADE_SKIN_MESSAGE_KEYS } from "@/lib/types/category-label-i18n";
import type { TradeBehaviorContext } from "./behavior-adapters";
import { resolveTradeCompositionProfileId } from "./composition-seeds";
import type { TradeCompositionProfileId } from "./types";

export const REAL_ESTATE_HERO_SKIP_FIELD_IDS = [
  "building_name",
  "price",
  "deposit",
  "monthly",
] as const;

export function resolveDetailSpecProfileId(input: {
  icon_key?: string | null;
  slug?: string | null;
  meta?: Record<string, unknown>;
}): TradeCompositionProfileId {
  const fromCategory =
    resolveTradeCompositionProfileId({ icon_key: input.icon_key, slug: input.slug }) ?? "general";
  const meta = input.meta ?? {};
  /** R6: rent-car before used-car — shared vehicle meta must not steal rental detail */
  if (fromCategory === "rent-car" || hasRentCarMeta(meta)) return "rent-car";
  if (fromCategory === "used-car" || hasUsedCarMeta(meta)) return "used-car";
  if (fromCategory !== "general") return fromCategory;
  if (hasExchangeMeta(meta)) return "exchange";
  if (hasJobsMeta(meta)) return "jobs";
  if (hasRealEstateMeta(meta)) return "real-estate";
  return "general";
}

export function detailSpecSectionTitleKey(
  profileId: TradeCompositionProfileId,
  iconKey?: string | null
): MessageKey {
  if (profileId === "used-car") return "trade_112";
  if (profileId === "exchange") return "trade_132";
  if (profileId === "real-estate") return "ui_post_real_estate_info";
  if (profileId === "rent-car") return "cat_skin_rent_car";
  const skin = iconKey ? TRADE_SKIN_MESSAGE_KEYS[iconKey] : undefined;
  return skin ?? "ui_post_product_description_heading";
}

export function behaviorContextFromDetailMeta(meta: Record<string, unknown>): TradeBehaviorContext {
  const carTrade = meta.car_trade === "buy" || meta.car_trade === "sell" ? meta.car_trade : null;
  return {
    carTrade,
    dealType: String(meta.deal_type ?? "").trim() || null,
    listingKind: String(meta.listing_kind ?? "").trim() || null,
    workCategory: String(meta.work_category ?? "").trim() || null,
    exchangeDirection: String(meta.exchange_direction ?? "").trim() || null,
  };
}

export function defaultDetailSkipFieldIds(
  profileId: TradeCompositionProfileId,
  meta: Record<string, unknown>
): string[] {
  if (profileId === "exchange") {
    const direction = String(meta.exchange_direction ?? "sell").trim();
    return direction === "sell" ? ["seller_prep"] : [];
  }
  return [];
}

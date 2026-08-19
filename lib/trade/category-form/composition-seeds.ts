/**
 * Product Seed Compositions — FINAL DESIGN RESTART (6 categories incl. rent-car).
 */
import type {
  TradeCompositionFieldOverlay,
  TradeCompositionProfileId,
  TradeSeedComposition,
} from "./types";

function f(
  id: string,
  order: number,
  required: boolean,
  active = true
): TradeCompositionFieldOverlay {
  return { id, order, required, active };
}

export const TRADE_SEED_COMPOSITIONS: Record<string, TradeSeedComposition> = {
  general: {
    profileId: "general",
    layoutVariant: "general-card",
    behaviorAdapterId: null,
    fields: [
      f("images", 10, true),
      f("title", 20, true),
      f("price", 30, true),
      f("is_free_share", 35, false),
      f("description", 40, true),
      f("location", 50, true),
      f("trade_meet_spot", 60, false),
      f("is_price_offer", 70, false, false),
    ],
  },
  "used-car": {
    profileId: "used-car",
    layoutVariant: "vehicle-card",
    behaviorAdapterId: "used-car-trade",
    fields: [
      f("car_trade", 5, true),
      f("images", 10, true),
      f("title", 20, false),
      f("make", 30, true),
      f("model", 40, true),
      f("year", 50, true),
      f("mileage", 60, true),
      f("body_type", 70, false),
      f("transmission", 75, false),
      f("fuel_type", 76, false),
      f("has_accident", 80, true),
      f("price", 90, true),
      f("description", 100, true),
      f("location", 110, true),
    ],
  },
  "real-estate": {
    profileId: "real-estate",
    layoutVariant: "property-card",
    behaviorAdapterId: "real-estate-deal",
    fields: [
      f("images", 10, true),
      f("deal_type", 20, true),
      f("estate_type", 30, true),
      f("title", 40, false),
      f("price", 50, false),
      f("deposit", 60, false),
      f("monthly", 70, false),
      f("management_fee", 80, false),
      f("has_premium", 85, false),
      f("floor_area", 90, true),
      f("bedrooms", 100, true),
      f("bathrooms", 110, true),
      f("move_in_date", 120, true),
      f("neighborhood", 130, false),
      f("building_name", 140, true),
      f("description", 150, true),
      f("location", 160, true),
    ],
  },
  jobs: {
    profileId: "jobs",
    layoutVariant: "job-card",
    behaviorAdapterId: "jobs-hire-seek",
    fields: [
      f("listing_kind", 10, true),
      f("images", 20, false),
      f("title", 30, true),
      f("work_category", 40, true),
      f("work_category_other", 45, false),
      f("work_term", 50, true),
      f("pay_type", 60, true),
      f("pay_amount", 70, false),
      f("description", 80, true),
      f("location", 90, true),
      f("work_date_start", 100, false),
      f("work_date_end", 110, false),
      f("company_name", 120, false),
      f("experience_level", 130, false),
      f("available_time", 140, false),
    ],
  },
  exchange: {
    profileId: "exchange",
    layoutVariant: "exchange-card",
    behaviorAdapterId: "exchange-php-krw",
    fields: [
      f("exchange_direction", 10, true),
      f("from_currency", 20, true),
      f("to_currency", 30, true),
      f("exchange_rate_base", 40, true),
      f("exchange_rate_plus", 50, false),
      f("exchange_rate", 60, true),
      f("amount", 70, true),
      f("converted_amount", 80, false),
      f("seller_prep", 90, false),
      f("buyer_prep", 100, true),
      f("rate_criteria_at", 110, false),
      f("description", 120, false),
      f("location", 130, true),
      f("images", 140, false),
    ],
  },
  "rent-car": {
    profileId: "rent-car",
    layoutVariant: "rental-card",
    behaviorAdapterId: "rent-car-rental",
    fields: [
      f("images", 10, true),
      f("make", 20, true),
      f("model", 30, true),
      f("year", 40, true),
      f("daily_price", 50, true),
      f("mileage_cap", 60, false),
      f("with_driver", 70, false),
      f("deposit", 80, false),
      f("pickup_location", 90, true),
      f("available_from", 100, false),
      f("transmission", 110, false),
      f("fuel_type", 120, false),
      f("description", 130, true),
      f("location", 140, true),
    ],
  },
};

/** Legacy bridge: category icon_key / slug → seed profile (NOT long-term meaning authority) */
export function resolveTradeCompositionProfileId(input: {
  icon_key?: string | null;
  slug?: string | null;
}): TradeCompositionProfileId | null {
  const ik = (input.icon_key ?? "").trim().toLowerCase();
  const slug = (input.slug ?? "").trim().toLowerCase();
  if (ik === "car") return "used-car";
  if (ik === "used-car" || slug === "used-car" || slug === "car") return "used-car";
  if (ik === "real-estate" || ik === "realty" || slug === "real-estate" || slug === "realty") {
    return "real-estate";
  }
  if (ik === "jobs" || ik === "job" || slug === "jobs" || slug === "job") return "jobs";
  if (ik === "exchange" || slug === "exchange" || slug === "current") return "exchange";
  if (ik === "rent-car" || ik === "rental-car" || slug === "rent-car" || slug === "rental-car") {
    return "rent-car";
  }
  if (ik === "general" || ik === "market" || slug === "market" || slug === "used" || ik === "") {
    return "general";
  }
  if (TRADE_SEED_COMPOSITIONS[ik]) return ik as TradeCompositionProfileId;
  return "general";
}

export function getTradeSeedComposition(
  profileId: string
): TradeSeedComposition | null {
  return TRADE_SEED_COMPOSITIONS[profileId] ?? null;
}

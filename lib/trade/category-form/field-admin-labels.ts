
import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * Human labels for Field Library ids in Admin (ko/en via caller).
 * Not storage authority — display only.
 */
export const TRADE_FIELD_ADMIN_LABELS: Record<string, { ko: string; en: string }> = {
  images: catalogPair("trade_images"),
  title: catalogPair("trade_title"),
  description: catalogPair("trade_description"),
  price: catalogPair("trade_price"),
  is_free_share: catalogPair("trade_free_share"),
  is_price_offer: catalogPair("trade_price_offer"),
  location: catalogPair("trade_location"),
  trade_meet_spot: catalogPair("trade_meet_spot"),
  car_trade: catalogPair("trade_buy_sell"),
  make: catalogPair("trade_make"),
  model: catalogPair("trade_write_model"),
  year: catalogPair("trade_year"),
  mileage: catalogPair("trade_write_mileage"),
  body_type: catalogPair("trade_write_body_type"),
  has_accident: catalogPair("trade_accident_history"),
  transmission: catalogPair("trade_transmission"),
  fuel_type: catalogPair("trade_fuel_type"),
  deal_type: catalogPair("trade_deal_type"),
  estate_type: catalogPair("trade_property_type"),
  deposit: catalogPair("trade_deposit"),
  monthly: catalogPair("trade_monthly_rent"),
  management_fee: catalogPair("trade_management_fee"),
  has_premium: catalogPair("trade_key_money"),
  floor_area: catalogPair("trade_floor_area"),
  bedrooms: catalogPair("trade_bedrooms"),
  bathrooms: catalogPair("trade_bathrooms"),
  move_in_date: catalogPair("trade_move_in"),
  neighborhood: catalogPair("trade_neighborhood"),
  building_name: catalogPair("trade_building"),
  listing_kind: catalogPair("trade_listing_kind"),
  work_category: catalogPair("trade_work_category"),
  work_category_other: catalogPair("trade_work_category_other"),
  work_term: catalogPair("trade_work_term"),
  pay_type: catalogPair("trade_pay_type"),
  pay_amount: catalogPair("trade_pay_amount"),
  company_name: catalogPair("trade_company"),
  experience_level: catalogPair("trade_experience"),
  available_time: catalogPair("trade_available_time"),
  work_date_start: catalogPair("trade_start_date"),
  work_date_end: catalogPair("trade_end_date"),
  exchange_direction: catalogPair("trade_exchange_direction"),
  from_currency: catalogPair("trade_from_currency"),
  to_currency: catalogPair("trade_to_currency"),
  exchange_rate_base: catalogPair("trade_base_rate"),
  exchange_rate_plus: catalogPair("trade_rate_plus"),
  exchange_rate: catalogPair("trade_exchange_rate"),
  amount: catalogPair("trade_amount"),
  converted_amount: catalogPair("trade_converted"),
  seller_prep: catalogPair("trade_seller_prep"),
  buyer_prep: catalogPair("trade_buyer_prep"),
  rate_criteria_at: catalogPair("trade_rate_criteria"),
  daily_price: catalogPair("trade_daily_price"),
  mileage_cap: catalogPair("trade_daily_mileage_cap"),
  with_driver: catalogPair("trade_with_driver"),
  pickup_location: catalogPair("trade_pickup_location"),
  available_from: catalogPair("trade_available_from"),
};

export function tradeFieldAdminLabel(id: string, lang: "ko" | "en"): string {
  const hit = TRADE_FIELD_ADMIN_LABELS[id];
  if (!hit) return id;
  return lang === "en" ? hit.en : hit.ko;
}

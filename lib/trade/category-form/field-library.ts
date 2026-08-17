/**
 * Approved Trade Field Library — Product SSOT (Phase 0C freeze).
 * Admin may compose these ids onto a category; may not invent new field types here.
 */
import type { TradeFieldDefinition } from "./types";

export const TRADE_FIELD_LIBRARY: Record<string, TradeFieldDefinition> = {
  images: {
    id: "images",
    widget: "images",
    storage: { kind: "column", column: "images" },
    surfaces: { write: true, list: "image", detail: true, edit: true, filter: false },
  },
  title: {
    id: "title",
    widget: "text",
    storage: { kind: "column", column: "title" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  description: {
    id: "description",
    widget: "textarea",
    storage: { kind: "column", column: "content" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  price: {
    id: "price",
    widget: "money",
    storage: { kind: "column", column: "price" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  is_free_share: {
    id: "is_free_share",
    widget: "boolean",
    storage: { kind: "column", column: "is_free_share" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: false },
  },
  is_price_offer: {
    id: "is_price_offer",
    widget: "boolean",
    storage: { kind: "column", column: "is_price_offer" },
    surfaces: { write: true, list: false, detail: false, edit: true, filter: false },
  },
  location: {
    id: "location",
    widget: "location",
    storage: { kind: "column", column: "region" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  trade_meet_spot: {
    id: "trade_meet_spot",
    widget: "meet_spot",
    storage: { kind: "meta", key: "trade_meet_spot" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },

  car_trade: {
    id: "car_trade",
    widget: "select",
    storage: { kind: "meta", key: "car_trade" },
    optionCatalogId: "used_car_trade",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: false },
  },
  make: {
    id: "make",
    widget: "select",
    storage: {
      kind: "combined_meta",
      writeKey: "car_model",
      legacyReadKey: "car_model",
      parts: ["make", "model"],
    },
    optionCatalogId: "used_car_brands",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  model: {
    id: "model",
    widget: "select",
    storage: {
      kind: "combined_meta",
      writeKey: "car_model",
      legacyReadKey: "car_model",
      parts: ["make", "model"],
    },
    optionCatalogId: "used_car_models",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  year: {
    id: "year",
    widget: "year",
    storage: { kind: "meta", key: "car_year" },
    legacyMetaKeys: ["car_year_max"],
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  mileage: {
    id: "mileage",
    widget: "number",
    unit: "km",
    storage: { kind: "meta", key: "mileage" },
    optionCatalogId: "used_car_mileage_presets",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "range" },
  },
  body_type: {
    id: "body_type",
    widget: "select",
    storage: { kind: "meta", key: "car_body_type" },
    optionCatalogId: "used_car_body_types",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  has_accident: {
    id: "has_accident",
    widget: "boolean",
    storage: { kind: "meta", key: "has_accident" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  transmission: {
    id: "transmission",
    widget: "select",
    storage: { kind: "meta", key: "transmission" },
    optionCatalogId: "vehicle_transmission",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  fuel_type: {
    id: "fuel_type",
    widget: "select",
    storage: { kind: "meta", key: "fuel_type" },
    optionCatalogId: "vehicle_fuel_type",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },

  deal_type: {
    id: "deal_type",
    widget: "select",
    storage: { kind: "meta", key: "deal_type" },
    optionCatalogId: "real_estate_deal_type",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  estate_type: {
    id: "estate_type",
    widget: "select",
    storage: { kind: "meta", key: "estate_type" },
    optionCatalogId: "real_estate_estate_type",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  deposit: {
    id: "deposit",
    widget: "money",
    storage: { kind: "meta", key: "deposit" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  monthly: {
    id: "monthly",
    widget: "money",
    storage: { kind: "meta", key: "monthly" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  management_fee: {
    id: "management_fee",
    widget: "money",
    storage: { kind: "meta", key: "management_fee" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  has_premium: {
    id: "has_premium",
    widget: "boolean",
    storage: { kind: "meta", key: "has_premium" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  floor_area: {
    id: "floor_area",
    widget: "number",
    unit: "sqm",
    storage: { kind: "meta", key: "size_sq" },
    legacyMetaKeys: ["area_sqm"],
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  bedrooms: {
    id: "bedrooms",
    widget: "number",
    storage: { kind: "meta", key: "room_count" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  bathrooms: {
    id: "bathrooms",
    widget: "number",
    storage: { kind: "meta", key: "bathroom_count" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  move_in_date: {
    id: "move_in_date",
    widget: "select",
    storage: { kind: "meta", key: "move_in_date" },
    optionCatalogId: "real_estate_move_in",
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  neighborhood: {
    id: "neighborhood",
    widget: "text",
    storage: { kind: "meta", key: "neighborhood" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  building_name: {
    id: "building_name",
    widget: "text",
    storage: { kind: "meta", key: "building_name" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },

  listing_kind: {
    id: "listing_kind",
    widget: "select",
    storage: { kind: "meta", key: "listing_kind" },
    legacyMetaKeys: ["job_type"],
    optionCatalogId: "jobs_listing_kind",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: true },
  },
  work_category: {
    id: "work_category",
    widget: "select",
    storage: { kind: "meta", key: "work_category" },
    optionCatalogId: "jobs_work_category",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  work_category_other: {
    id: "work_category_other",
    widget: "text",
    storage: { kind: "meta", key: "work_category_other" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  work_term: {
    id: "work_term",
    widget: "select",
    storage: { kind: "meta", key: "work_term" },
    optionCatalogId: "jobs_work_term",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  pay_type: {
    id: "pay_type",
    widget: "select",
    storage: { kind: "meta_or_column", metaKey: "pay_type", column: "pay_type" },
    optionCatalogId: "jobs_pay_type",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  pay_amount: {
    id: "pay_amount",
    widget: "money",
    storage: { kind: "meta_or_column", metaKey: "pay_amount", column: "pay_amount" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  company_name: {
    id: "company_name",
    widget: "text",
    storage: { kind: "meta", key: "company_name" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  experience_level: {
    id: "experience_level",
    widget: "select",
    storage: { kind: "meta", key: "experience_level" },
    optionCatalogId: "jobs_experience_level",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: false },
  },
  available_time: {
    id: "available_time",
    widget: "text",
    storage: { kind: "meta", key: "available_time" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: false },
  },
  work_date_start: {
    id: "work_date_start",
    widget: "text",
    storage: { kind: "meta", key: "work_date_start" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  work_date_end: {
    id: "work_date_end",
    widget: "text",
    storage: { kind: "meta", key: "work_date_end" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },

  exchange_direction: {
    id: "exchange_direction",
    widget: "select",
    storage: { kind: "meta", key: "exchange_direction" },
    optionCatalogId: "exchange_direction",
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "weak" },
  },
  from_currency: {
    id: "from_currency",
    widget: "select",
    storage: { kind: "meta", key: "from_currency" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  to_currency: {
    id: "to_currency",
    widget: "select",
    storage: { kind: "meta", key: "to_currency" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  exchange_rate_base: {
    id: "exchange_rate_base",
    widget: "number",
    storage: { kind: "meta", key: "exchange_rate_base" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: false },
  },
  exchange_rate_plus: {
    id: "exchange_rate_plus",
    widget: "number",
    storage: { kind: "meta", key: "exchange_rate_plus" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: false },
  },
  exchange_rate: {
    id: "exchange_rate",
    widget: "number",
    storage: { kind: "meta", key: "exchange_rate" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "weak" },
  },
  amount: {
    id: "amount",
    widget: "money",
    unit: "php",
    storage: { kind: "meta_or_column", metaKey: "amount", column: "price" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "weak" },
  },
  converted_amount: {
    id: "converted_amount",
    widget: "derived",
    unit: "krw",
    storage: { kind: "derived" },
    surfaces: { write: false, list: true, detail: true, edit: false, filter: false },
  },
  seller_prep: {
    id: "seller_prep",
    widget: "select",
    storage: { kind: "meta", key: "seller_prep" },
    optionCatalogId: "exchange_prep",
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  buyer_prep: {
    id: "buyer_prep",
    widget: "select",
    storage: { kind: "meta", key: "buyer_prep" },
    optionCatalogId: "exchange_prep",
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  rate_criteria_at: {
    id: "rate_criteria_at",
    widget: "text",
    storage: { kind: "meta", key: "rate_criteria_at" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },

  /** Rent-car — daily rate stored as price column + meta for clarity */
  daily_price: {
    id: "daily_price",
    widget: "money",
    storage: { kind: "meta_or_column", metaKey: "daily_price", column: "price" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  mileage_cap: {
    id: "mileage_cap",
    widget: "number",
    unit: "km",
    storage: { kind: "meta", key: "mileage_cap" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  with_driver: {
    id: "with_driver",
    widget: "boolean",
    storage: { kind: "meta", key: "with_driver" },
    surfaces: { write: true, list: true, detail: true, edit: true, filter: "partial" },
  },
  pickup_location: {
    id: "pickup_location",
    widget: "text",
    storage: { kind: "meta", key: "pickup_location" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
  available_from: {
    id: "available_from",
    widget: "text",
    storage: { kind: "meta", key: "available_from" },
    surfaces: { write: true, list: false, detail: true, edit: true, filter: false },
  },
};

export function getTradeFieldDefinition(id: string): TradeFieldDefinition | null {
  return TRADE_FIELD_LIBRARY[id] ?? null;
}

export function assertApprovedTradeFieldId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRADE_FIELD_LIBRARY, id);
}

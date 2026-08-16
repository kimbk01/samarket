/**
 * Trade Category Form — Field Library + Composition contracts (FINAL DESIGN LOCK).
 * DO NOT invent storage/widget/validator in Admin DB. Product Field Library is SSOT.
 */

export type TradeFieldWidget =
  | "images"
  | "text"
  | "textarea"
  | "money"
  | "number"
  | "year"
  | "select"
  | "boolean"
  | "location"
  | "meet_spot"
  | "derived";

export type TradeFieldSurface = {
  write: boolean;
  list: boolean | "image" | "exchange_thumb";
  detail: boolean;
  edit: boolean;
  filter: boolean | "partial" | "weak" | "range";
};

/** Where a field value is read/written on posts row / meta */
export type TradeFieldStorage =
  | { kind: "column"; column: string }
  | { kind: "meta"; key: string }
  | { kind: "meta_or_column"; metaKey: string; column: string }
  | { kind: "derived" }
  | {
      kind: "combined_meta";
      /** V1 used-car make+model → meta.car_model */
      writeKey: string;
      legacyReadKey: string;
      parts: readonly string[];
    };

export type TradeFieldDefinition = {
  id: string;
  widget: TradeFieldWidget;
  storage: TradeFieldStorage;
  /** Optional unit label key hint (e.g. km) — display only */
  unit?: "km" | "sqm" | "php" | "krw";
  surfaces: TradeFieldSurface;
  /** Option catalog id in Product code (not Admin-invented) */
  optionCatalogId?: string;
  /** Legacy meta keys still readable */
  legacyMetaKeys?: readonly string[];
};

export type TradeCompositionFieldOverlay = {
  id: string;
  active: boolean;
  required: boolean;
  order: number;
};

export type TradeFieldCompositionPayload = {
  v: 1;
  fields: TradeCompositionFieldOverlay[];
};

export type TradeCompositionProfileId =
  | "general"
  | "used-car"
  | "real-estate"
  | "jobs"
  | "exchange";

export type TradeLayoutVariant =
  | "general-card"
  | "vehicle-card"
  | "property-card"
  | "job-card"
  | "exchange-card";

export type TradeSeedComposition = {
  profileId: TradeCompositionProfileId;
  layoutVariant: TradeLayoutVariant;
  /** Behavior adapter id — thin hooks only, never a full WriteModule */
  behaviorAdapterId: string | null;
  fields: TradeCompositionFieldOverlay[];
};

export type ResolvedTradeCompositionField = TradeCompositionFieldOverlay & {
  definition: TradeFieldDefinition;
};

export type ResolvedTradeComposition = {
  profileId: TradeCompositionProfileId | "custom";
  layoutVariant: TradeLayoutVariant;
  behaviorAdapterId: string | null;
  source: "db_overlay" | "product_seed";
  fields: ResolvedTradeCompositionField[];
};

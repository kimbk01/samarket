/**
 * Trade category form contracts — Field Library + Composition (FINAL DESIGN).
 */
export type {
  TradeFieldWidget,
  TradeFieldSurface,
  TradeFieldStorage,
  TradeFieldDefinition,
  TradeCompositionFieldOverlay,
  TradeFieldCompositionPayload,
  TradeCompositionProfileId,
  TradeLayoutVariant,
  TradeSeedComposition,
  ResolvedTradeCompositionField,
  ResolvedTradeComposition,
} from "./types";

export {
  TRADE_FIELD_LIBRARY,
  getTradeFieldDefinition,
  assertApprovedTradeFieldId,
} from "./field-library";

export {
  TRADE_SEED_COMPOSITIONS,
  resolveTradeCompositionProfileId,
  getTradeSeedComposition,
} from "./composition-seeds";

export {
  parseTradeFieldCompositionPayload,
  serializeTradeFieldCompositionPayload,
} from "./parse-field-composition";

export {
  resolveTradeComposition,
  compositionFieldsForSurface,
  type ResolveTradeCompositionInput,
} from "./resolve-composition";

export { buildCompositionListAttributes, joinCompositionListAttributeLine, type CompositionListAttribute } from "./list-attributes";

export { buildCompositionDetailAttributes, type CompositionDetailAttribute } from "./detail-attributes";

export {
  resolveDetailSpecProfileId,
  detailSpecSectionTitleKey,
  REAL_ESTATE_HERO_SKIP_FIELD_IDS,
} from "./detail-spec-route";

export { formatCompositionDetailField } from "./detail-field-formatters";

export {
  resolveTradeDetailCtaPolicy,
  type TradeDetailCtaPolicy,
  type TradeDetailCtaPolicyInput,
} from "./cta-policy";

export {
  hydrateTradeCategoryFieldsFromSnapshot,
  readCompositionFieldFromSnapshot,
} from "./edit-hydrator";

export { writeWidgetKeyForField, TRADE_WRITE_WIDGET_KEYS } from "./write-widget-registry";

export { resolveTradeCompositionForCategory } from "./resolve-for-category";

export {
  applyTradeBehaviorAdapter,
  visibleAdaptedFields,
  type TradeBehaviorContext,
  type AdaptedCompositionField,
} from "./behavior-adapters";

export { getTradeOptionCatalog, labelForTradeOption } from "./option-catalogs";

export { tradeFieldAdminLabel, TRADE_FIELD_ADMIN_LABELS } from "./field-admin-labels";

export {
  resolveUsesJobsTradeWriteForm,
  resolveUsesExchangeTradeWriteForm,
} from "./write-form-profile";

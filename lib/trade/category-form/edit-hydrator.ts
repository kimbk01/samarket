/**
 * Edit hydrator — Field Library storage authority for CREATE == EDIT contract.
 * Maps snapshot meta/columns → TradeWriteForm field bag via readFieldValueFromBags.
 */
import { TRADE_FIELD_LIBRARY } from "./field-library";
import { readFieldValueFromBags } from "./field-value-bridge";
import { formatPriceInput } from "@/lib/utils/format";

function asMoney(v: string | boolean): string {
  if (typeof v === "boolean") return "";
  return formatPriceInput(String(v).replace(/,/g, ""));
}

function asStr(v: string | boolean): string {
  if (typeof v === "boolean") return v ? "true" : "";
  return String(v ?? "").trim();
}

/** Read one Field Library id from post snapshot bags */
export function readCompositionFieldFromSnapshot(
  fieldId: string,
  bags: { meta: Record<string, unknown>; post?: Record<string, unknown> }
): string | boolean {
  const def = TRADE_FIELD_LIBRARY[fieldId];
  if (!def) return "";
  return readFieldValueFromBags(def, bags);
}

/** Real-estate / used-car / rent-car overlapping TradeWriteForm keys from Field Library */
export function hydrateTradeCategoryFieldsFromSnapshot(bags: {
  meta: Record<string, unknown>;
  post?: Record<string, unknown>;
}): {
  neighborhood: string;
  buildingName: string;
  estateType: string;
  dealType: "임대" | "판매";
  deposit: string;
  monthly: string;
  managementFee: string;
  hasPremium: boolean;
  areaSqm: string;
  roomCount: string;
  bathroomCount: string;
  moveInDate: string;
  carModel: string;
  carYear: string;
  mileage: string;
  usedCarTrade: "buy" | "sell" | null;
  carHasAccident: boolean;
  transmission: string;
  fuelType: string;
  usedCarBodyTypeKey: string;
  /** rent-car */
  mileageCap: string;
  withDriver: boolean;
  pickupLocation: string;
  availableFrom: string;
  dailyPrice: string;
} {
  const deal = asStr(readCompositionFieldFromSnapshot("deal_type", bags));
  const carTrade = asStr(readCompositionFieldFromSnapshot("car_trade", bags));
  const hasAccident = readCompositionFieldFromSnapshot("has_accident", bags);
  const hasPremium = readCompositionFieldFromSnapshot("has_premium", bags);
  const withDriver = readCompositionFieldFromSnapshot("with_driver", bags);

  return {
    neighborhood: asStr(readCompositionFieldFromSnapshot("neighborhood", bags)),
    buildingName: asStr(readCompositionFieldFromSnapshot("building_name", bags)),
    estateType: asStr(readCompositionFieldFromSnapshot("estate_type", bags)),
    dealType: deal === "판매" ? "판매" : "임대",
    deposit: asMoney(readCompositionFieldFromSnapshot("deposit", bags)),
    monthly: asMoney(readCompositionFieldFromSnapshot("monthly", bags)),
    managementFee: asMoney(readCompositionFieldFromSnapshot("management_fee", bags)),
    hasPremium: hasPremium === true,
    areaSqm: asStr(readCompositionFieldFromSnapshot("floor_area", bags)),
    roomCount: asStr(readCompositionFieldFromSnapshot("bedrooms", bags)),
    bathroomCount: asStr(readCompositionFieldFromSnapshot("bathrooms", bags)),
    moveInDate: asStr(readCompositionFieldFromSnapshot("move_in_date", bags)),
    carModel: asStr(readCompositionFieldFromSnapshot("make", bags)),
    carYear: asStr(readCompositionFieldFromSnapshot("year", bags)),
    mileage: asStr(readCompositionFieldFromSnapshot("mileage", bags)),
    usedCarTrade: carTrade === "buy" || carTrade === "sell" ? carTrade : null,
    carHasAccident: hasAccident === true,
    transmission: asStr(readCompositionFieldFromSnapshot("transmission", bags)),
    fuelType: asStr(readCompositionFieldFromSnapshot("fuel_type", bags)),
    usedCarBodyTypeKey: asStr(readCompositionFieldFromSnapshot("body_type", bags)),
    mileageCap: asStr(readCompositionFieldFromSnapshot("mileage_cap", bags)).replace(/\D/g, ""),
    withDriver: withDriver === true,
    pickupLocation: asStr(readCompositionFieldFromSnapshot("pickup_location", bags)),
    availableFrom: asStr(readCompositionFieldFromSnapshot("available_from", bags)),
    dailyPrice: asMoney(readCompositionFieldFromSnapshot("daily_price", bags)),
  };
}

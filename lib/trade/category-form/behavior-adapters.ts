/**
 * Thin Behavior Adapters — visibility/required only. NOT WriteModules.
 */
import type { ResolvedTradeComposition, ResolvedTradeCompositionField } from "./types";

export type TradeBehaviorContext = {
  /** used-car */
  carTrade?: "buy" | "sell" | null;
  /** real-estate — stored ko literals */
  dealType?: string | null;
  /** jobs */
  listingKind?: "hire" | "work" | string | null;
  /** jobs — when "기타", show work_category_other */
  workCategory?: string | null;
  /** exchange */
  exchangeDirection?: "buy" | "sell" | string | null;
};

export type AdaptedCompositionField = ResolvedTradeCompositionField & {
  visible: boolean;
  effectiveRequired: boolean;
};

function adaptUsedCar(
  fields: ResolvedTradeCompositionField[],
  ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  const mode = ctx.carTrade === "buy" ? "buy" : "sell";
  return fields.map((f) => {
    let visible = true;
    let effectiveRequired = f.required;
    if (mode === "buy") {
      if (f.id === "make" || f.id === "model" || f.id === "mileage" || f.id === "has_accident") {
        visible = false;
        effectiveRequired = false;
      }
      if (f.id === "body_type") {
        visible = true;
        effectiveRequired = true;
      }
      if (f.id === "images") {
        effectiveRequired = false;
      }
      if (f.id === "transmission" || f.id === "fuel_type") {
        visible = false;
        effectiveRequired = false;
      }
    } else {
      if (f.id === "body_type") {
        visible = false;
        effectiveRequired = false;
      }
      if (f.id === "make" || f.id === "model" || f.id === "year" || f.id === "mileage") {
        effectiveRequired = true;
      }
    }
    return { ...f, visible, effectiveRequired };
  });
}

function adaptRealEstate(
  fields: ResolvedTradeCompositionField[],
  ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  const deal = String(ctx.dealType ?? "").trim();
  const isSale = deal === "판매";
  const isRent = deal === "임대";
  return fields.map((f) => {
    let visible = true;
    let effectiveRequired = f.required;
    if (f.id === "price") {
      visible = isSale;
      effectiveRequired = isSale;
    }
    if (f.id === "deposit" || f.id === "monthly") {
      visible = isRent;
      effectiveRequired = isRent;
    }
    if (f.id === "management_fee" || f.id === "has_premium") {
      visible = isRent;
      effectiveRequired = false;
    }
    return { ...f, visible, effectiveRequired };
  });
}

function adaptJobs(
  fields: ResolvedTradeCompositionField[],
  ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  const kind = String(ctx.listingKind ?? "").trim();
  const isHire = kind === "hire";
  const isSeek = kind === "work" || kind === "seek";
  return fields.map((f) => {
    let visible = true;
    let effectiveRequired = f.required;
    if (f.id === "company_name") {
      visible = isHire;
      effectiveRequired = false;
    }
    if (f.id === "work_category_other") {
      visible = String(ctx.workCategory ?? "").trim() === "기타";
      effectiveRequired = visible;
    }
    if (f.id === "experience_level" || f.id === "available_time") {
      visible = isSeek || !kind;
      effectiveRequired = false;
    }
    return { ...f, visible, effectiveRequired };
  });
}

function adaptExchange(
  fields: ResolvedTradeCompositionField[],
  ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  const dir = String(ctx.exchangeDirection ?? "sell").trim();
  return fields.map((f) => {
    let visible = true;
    let effectiveRequired = f.required;
    if (f.id === "converted_amount") {
      visible = true;
      effectiveRequired = false;
    }
    if (f.id === "seller_prep") {
      visible = dir !== "sell";
      effectiveRequired = false;
    }
    if (f.id === "from_currency" || f.id === "to_currency") {
      effectiveRequired = true;
    }
    return { ...f, visible, effectiveRequired };
  });
}

/** Rent-car — all seed fields visible; required follows overlay/seed */
function adaptRentCar(
  fields: ResolvedTradeCompositionField[],
  _ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  return fields.map((f) => ({
    ...f,
    visible: true,
    effectiveRequired: f.required,
  }));
}

/** Apply adapter; unknown adapter → all visible with seed required */
export function applyTradeBehaviorAdapter(
  composition: ResolvedTradeComposition,
  ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  const id = composition.behaviorAdapterId;
  if (id === "used-car-trade") return adaptUsedCar(composition.fields, ctx);
  if (id === "real-estate-deal") return adaptRealEstate(composition.fields, ctx);
  if (id === "jobs-hire-seek") return adaptJobs(composition.fields, ctx);
  if (id === "exchange-php-krw") return adaptExchange(composition.fields, ctx);
  if (id === "rent-car-rental") return adaptRentCar(composition.fields, ctx);
  return composition.fields.map((f) => ({
    ...f,
    visible: true,
    effectiveRequired: f.required,
  }));
}

export function visibleAdaptedFields(
  composition: ResolvedTradeComposition,
  ctx: TradeBehaviorContext
): AdaptedCompositionField[] {
  return applyTradeBehaviorAdapter(composition, ctx).filter((f) => f.visible);
}

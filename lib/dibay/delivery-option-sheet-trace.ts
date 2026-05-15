"use client";

import {
  DELIVERY_PERF_TAG_OPTION_ADD_SUBMIT_MS,
  DELIVERY_PERF_TAG_OPTION_PRICE_PATCH_MS,
  DELIVERY_PERF_TAG_OPTION_SELECT_MS,
  DELIVERY_PERF_TAG_OPTION_SHEET_OPEN_MS,
  DELIVERY_PERF_TAG_OPTION_VALIDATION_MS,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import type { ModifierSelectionsWire, ParsedOptionGroup } from "@/lib/stores/modifiers/types";

export type DeliveryOptionHydrateState = "seed" | "loading" | "full" | "error" | "empty";

type OptionTraceBase = {
  product_id?: string | null;
  store_id?: string | null;
  has_options: boolean;
  required_group_count: number;
  selected_option_count: number;
  total_price: number;
  hydrate_state: DeliveryOptionHydrateState;
  used_seed: boolean;
  full_hydrated: boolean;
  render_count: number;
};

let seq = 0;

export function deliveryOptionTraceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function countRequiredOptionGroups(groups: ParsedOptionGroup[]): number {
  let n = 0;
  for (const g of groups) {
    if (g.isRequired || g.minSelect > 0) n += 1;
  }
  return n;
}

export function countSelectedOptions(wire: ModifierSelectionsWire): number {
  let n = 0;
  for (const names of Object.values(wire.pick)) n += names.length;
  for (const qtyByItem of Object.values(wire.qty)) {
    for (const qty of Object.values(qtyByItem)) n += Math.max(0, Math.floor(Number(qty) || 0));
  }
  return n;
}

function nextEventKey(kind: string, productId?: string | null): string {
  seq += 1;
  return `${kind}:${productId ?? "none"}:${seq}`;
}

function rounded(ms: number): number {
  return Math.max(0, Math.round(ms));
}

export function traceDeliveryOptionSheetOpenMs(valueMs: number, base: OptionTraceBase): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_SHEET_OPEN_MS, {
    event: "option_sheet_open_ms",
    event_key: nextEventKey("open", base.product_id),
    value_ms: rounded(valueMs),
    ...base,
  });
}

export function traceDeliveryOptionSelectMs(
  valueMs: number,
  base: OptionTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_SELECT_MS, {
    event: "option_select_ms",
    event_key: nextEventKey("select", base.product_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryOptionPricePatchMs(
  valueMs: number,
  base: OptionTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_PRICE_PATCH_MS, {
    event: "option_price_patch_ms",
    event_key: nextEventKey("price", base.product_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryOptionValidationMs(
  valueMs: number,
  base: OptionTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_VALIDATION_MS, {
    event: "option_validation_ms",
    event_key: nextEventKey("validation", base.product_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryOptionAddSubmitMs(
  valueMs: number,
  base: OptionTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_ADD_SUBMIT_MS, {
    event: "option_add_submit_ms",
    event_key: nextEventKey("add", base.product_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

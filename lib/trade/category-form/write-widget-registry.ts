/**
 * Generic write field registry — maps Field Library widget → renderer key.
 * Full UI cutover of TradeWriteForm is subsequent; this locks the widget contract.
 */
import type { TradeFieldWidget } from "./types";

export const TRADE_WRITE_WIDGET_KEYS: Record<TradeFieldWidget, string> = {
  images: "TradeWriteWidgetImages",
  text: "TradeWriteWidgetText",
  textarea: "TradeWriteWidgetTextarea",
  money: "TradeWriteWidgetMoney",
  number: "TradeWriteWidgetNumber",
  year: "TradeWriteWidgetYear",
  select: "TradeWriteWidgetSelect",
  boolean: "TradeWriteWidgetBoolean",
  location: "TradeWriteWidgetLocation",
  meet_spot: "TradeWriteWidgetMeetSpot",
  derived: "TradeWriteWidgetDerived",
};

export function writeWidgetKeyForField(widget: TradeFieldWidget): string {
  return TRADE_WRITE_WIDGET_KEYS[widget];
}

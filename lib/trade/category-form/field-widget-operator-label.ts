/**
 * Operator-facing widget labels for Field Library (no raw widget ids in UI).
 */
import type { TradeFieldWidget } from "@/lib/trade/category-form/types";

const KO: Partial<Record<TradeFieldWidget, string>> = {
  text: "텍스트",
  textarea: "긴 글",
  number: "숫자",
  year: "연도",
  money: "금액",
  select: "선택형",
  boolean: "사용/미사용",
  location: "위치",
  meet_spot: "약속장소",
  images: "사진",
};

const EN: Partial<Record<TradeFieldWidget, string>> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  year: "Year",
  money: "Money",
  select: "Select",
  boolean: "On/Off",
  location: "Location",
  meet_spot: "Meet spot",
  images: "Photos",
};

export function tradeFieldWidgetOperatorLabel(
  widget: string | undefined,
  lang: "ko" | "en"
): string {
  const map = lang === "en" ? EN : KO;
  const key = String(widget ?? "").trim() as TradeFieldWidget;
  return map[key] ?? (lang === "en" ? "Field" : "입력");
}

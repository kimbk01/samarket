/**
 * 중고차 posts.meta.car_trade — 리스트·상세·어드민 공통 표시
 */
import type { MessageKey } from "@/lib/i18n/messages";

export function getCarTradeLabelKo(
  meta: Record<string, unknown> | null | undefined
): "삽니다" | "팝니다" | null {
  const ct = meta?.car_trade;
  if (ct === "buy") return "삽니다";
  if (ct === "sell") return "팝니다";
  return null;
}

type CarTradeT = (key: MessageKey) => string;

export function getCarTradeLabel(
  t: CarTradeT,
  meta: Record<string, unknown> | null | undefined
): string | null {
  const ct = meta?.car_trade;
  if (ct === "buy") return t("trade_071");
  if (ct === "sell") return t("trade_126");
  return null;
}

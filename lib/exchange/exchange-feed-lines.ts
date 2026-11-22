/**
 * 환전 글 피드/채팅 카드 공통 — PostCard·ChatProductSummary 동일 표기
 */

export { hasExchangeMeta } from "@/lib/posts/post-variant";

export function getExchangeFeedLines(
  meta: Record<string, unknown>,
  postPrice: number | null | undefined
): { phpAmount: number | null; rateLine: string | null } {
  const exchangeRateBase = meta.exchange_rate_base != null ? Number(meta.exchange_rate_base) : null;
  const exchangeRateSum = meta.exchange_rate != null ? Number(meta.exchange_rate) : null;
  const exchangeRatePlus = meta.exchange_rate_plus != null ? Number(meta.exchange_rate_plus) : null;
  const rateNum =
    exchangeRateBase != null && !Number.isNaN(exchangeRateBase) && exchangeRateBase > 0
      ? exchangeRateBase
      : exchangeRateSum;
  const hasRatePlus =
    exchangeRatePlus != null && !Number.isNaN(exchangeRatePlus) && exchangeRatePlus !== 0;
  const rateLine =
    rateNum != null && !Number.isNaN(rateNum) && rateNum > 0
      ? hasRatePlus
        ? `1 PHP = ${rateNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW ${formatExchangeRatePlus(exchangeRatePlus!)}`
        : `1 PHP = ${rateNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW`
      : null;
  const exchangeAmount =
    postPrice != null
      ? Number(postPrice)
      : meta.amount != null
        ? Number(meta.amount)
        : null;
  const phpAmount =
    exchangeAmount != null && !Number.isNaN(exchangeAmount) ? exchangeAmount : null;
  return { phpAmount, rateLine };
}

/** 감사 X4 (2026-11-22): 가산값 부호 — 음수는 「-0.5」(이전: 「+-0.5」) */
export function formatExchangeRatePlus(plus: number): string {
  const abs = Math.abs(plus).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return plus < 0 ? `-${abs}` : `+${abs}`;
}

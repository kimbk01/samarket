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
        ? `1 PHP = ${rateNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW +${exchangeRatePlus}`
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

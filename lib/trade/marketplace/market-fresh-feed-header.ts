/** Internal request header — PTR fresh feed without URL contract change. */
export const DIBAY_MARKET_FRESH_FEED_HEADER = "x-dibay-market-fresh-feed";

export function isDibayMarketFreshFeedRequest(
  headers: { get(name: string): string | null } | null | undefined
): boolean {
  return (headers?.get(DIBAY_MARKET_FRESH_FEED_HEADER) ?? "").trim() === "1";
}

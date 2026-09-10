import type { CommunityCrawlBoardRow, CommunityCrawlSourceRow } from "@/lib/community-crawler/crawl-ssot";
import { TRAVEL_PHILIPPINES_ADAPTER_KEY } from "@/lib/community-crawler/adapters/travel-philippines";

export type CommunityCrawlAdapterKey = typeof TRAVEL_PHILIPPINES_ADAPTER_KEY | "generic_html";

/**
 * Shared adapter resolution for TEST + REAL crawl.
 * Live Travel PH board: crawler_type/crawl_mode=custom_adapter + adapter_key=travel_philippines.
 */
export function resolveCommunityCrawlAdapterKey(
  source: CommunityCrawlSourceRow,
  board: CommunityCrawlBoardRow
): CommunityCrawlAdapterKey | null {
  const adapterKey = (source.adapter_key || "").trim();
  if (adapterKey === TRAVEL_PHILIPPINES_ADAPTER_KEY) return TRAVEL_PHILIPPINES_ADAPTER_KEY;
  if (/philippines\.travel/i.test(source.base_url) || /philippines\.travel/i.test(board.list_url)) {
    return TRAVEL_PHILIPPINES_ADAPTER_KEY;
  }
  if (
    adapterKey === "generic_html" ||
    board.crawl_mode === "generic_html" ||
    source.crawler_type === "generic_html" ||
    (!adapterKey && board.crawl_mode !== "custom_adapter" && source.crawler_type !== "custom_adapter")
  ) {
    return "generic_html";
  }
  // Unknown custom_adapter — caller must fail with ADAPTER_UNSUPPORTED.
  return null;
}

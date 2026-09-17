/**
 * Platform PH City/Municipality geographic identity — shared consumer of Trade national LGU.
 * Delivery and Trade both consume this dataset; do not fork a Delivery-only City catalog.
 */

export type {
  NationalLguCandidate,
  NationalLguResolution,
  TradeNationalLgu,
} from "@/lib/trade/location/national/types";

export { resolveTradeNationalLgu as resolvePlatformPhLgu } from "@/lib/trade/location/national/resolve-trade-national-lgu";
export { resolveTradeNationalLguFromAddressFields as resolvePlatformPhLguFromAddressFields } from "@/lib/trade/location/national/resolve-from-address-fields";
export {
  getTradeNationalLguById as getPlatformPhLguById,
  loadTradeNationalLguDataset as loadPlatformPhLguDataset,
} from "@/lib/trade/location/national/load-national-lgu-dataset";
export {
  getTradeLguCentroid as getPlatformPhLguCentroid,
  matchTradeLguIdsInRadius as matchPlatformPhLguIdsInRadius,
} from "@/lib/trade/location/national/lgu-centroids";
export { getTradeNationalLguDisplayNameById as getPlatformPhLguDisplayNameById } from "@/lib/trade/location/national/lgu-display-by-id";
export { searchTradeNationalLgu as searchPlatformPhLgu } from "@/lib/trade/location/national/search-trade-national-lgu";

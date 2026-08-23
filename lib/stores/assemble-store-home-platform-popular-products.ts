/**
 * HOME feed re-export shim — pure assembly lives in `assemble-platform-popular-products.ts`.
 * BROWSE must import the domain-neutral module, not this file.
 */
export type {
  ActiveProductCatalogEntry as StoreHomeActiveProductCatalogEntry,
  PlatformPopularProduct as StoreHomePlatformPopularProduct,
} from "@/lib/stores/assemble-platform-popular-products";

export {
  assemblePlatformPopularProductsForStore,
  buildActiveProductCatalogMap,
  resolveFirstPlatformPopularProduct,
  resolvePopularMenuStatsSinceIso,
} from "@/lib/stores/assemble-platform-popular-products";

/**
 * 가격 제안(dibaY) — API·서버 로더 공통 진입점. 구현은 [price-offers.server.ts](lib/offers/price-offers.server.ts).
 */
export {
  acceptPriceOffer,
  createPriceOffer,
  listPriceOffers,
  listSellerPriceOffersForProduct,
  rejectPriceOffer,
} from "@/lib/offers/price-offers.server";

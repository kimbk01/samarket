import type { ChatRoomSource } from "@/lib/types/chat";

export const PRICE_OFFER_STATUSES = ["pending", "accepted", "rejected", "expired"] as const;

export type PriceOfferStatus = (typeof PRICE_OFFER_STATUSES)[number];

export type PriceOfferRow = {
  id: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  original_price: number;
  offered_price: number;
  message: string | null;
  status: PriceOfferStatus;
  created_at: string;
  updated_at: string;
};

export type PriceOfferListItem = {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  originalPrice: number;
  offeredPrice: number;
  message: string | null;
  status: PriceOfferStatus;
  createdAt: string;
  updatedAt: string;
  productTitle: string;
  productThumbnailUrl: string | null;
  productStatus: string | null;
  productHref: string;
  buyerNickname: string | null;
  sellerNickname: string | null;
};

export type PriceOfferTransitionResult = {
  offer: PriceOfferListItem;
  chatRoomId: string | null;
  chatRoomSource: ChatRoomSource | null;
  messengerRoomId: string | null;
};

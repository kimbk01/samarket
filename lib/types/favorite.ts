/**
 * 7단계: 찜/관심상품 타입 (Supabase 연동 시 교체용)
 */

export interface ProductFavorite {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

export interface FavoriteProduct {
  id: string;
  title: string;
  price: number;
  location: string;
  createdAt: string;
  status: string;
  /** posts.seller_listing_state */
  sellerListingState?: string;
  thumbnail: string;
  likesCount: number;
  chatCount: number;
  isBoosted: boolean;
  sellerId?: string;
  favoritedAt: string;
}

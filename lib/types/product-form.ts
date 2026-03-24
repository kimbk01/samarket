/**
 * 4단계: 상품 등록/수정 폼 타입 (Supabase insert 대체용 payload)
 */

export type ProductCondition = "new" | "like_new" | "good" | "fair";

export interface ProductFormPayload {
  images: (File | string)[];
  title: string;
  description: string;
  price: string;
  category: string;
  region: string;
  city: string;
  barangay: string;
  condition: ProductCondition;
  isPriceOfferEnabled: boolean;
}

export type ProductFormInitialValues = Partial<ProductFormPayload>;

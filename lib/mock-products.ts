/**
 * 2·3단계: 홈 리스트 + 상세 mock (id 기준 동일 데이터)
 * 4단계: addMockProduct, saveProductFromFormPayload
 */

import type { Product } from "@/lib/types/product";
import type { ProductFormPayload } from "@/lib/types/product-form";
import { getLocationLabel } from "@/lib/products/form-options";
import { MOCK_DATA_AS_OF_MS } from "@/lib/mock-time-anchor";

const base = (overrides: Partial<Product> & Pick<Product, "id" | "title" | "price" | "location" | "createdAt" | "status">): Product => ({
  thumbnail: "",
  likesCount: 0,
  chatCount: 0,
  isBoosted: false,
  ...overrides,
});

export const MOCK_PRODUCTS: Product[] = [
  {
    ...base({
      id: "1",
      title: "아이폰 14 Pro 256GB",
      price: 1200000,
      location: "Manila · Malate",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 30).toISOString(),
      status: "active",
      likesCount: 12,
      chatCount: 5,
      isBoosted: true,
      distance: 0.5,
    }),
    category: "디지털/가전",
    images: [],
    description: "직거래 우선입니다. 박스·케이스 포함이에요.",
    viewCount: 128,
    seller: {
      id: "s1",
      nickname: "판매자A",
      avatar: "",
      location: "Manila · Malate",
      mannerTemp: 36.5,
    },
  },
  {
    ...base({
      id: "2",
      title: "맥북 에어 M2",
      price: 1500000,
      location: "Quezon City · Diliman",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 2).toISOString(),
      status: "reserved",
      likesCount: 24,
      chatCount: 8,
      isBoosted: false,
      distance: 1.2,
    }),
    category: "디지털/가전",
    images: [],
    description: "M2 256GB, 배터리 양호합니다.",
    viewCount: 256,
    seller: {
      id: "s2",
      nickname: "판매자B",
      avatar: "",
      location: "Quezon City · Diliman",
      mannerTemp: 36.8,
    },
  },
  {
    ...base({
      id: "3",
      title: "무선 이어폰",
      price: 35000,
      location: "Cebu · Lahug",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24).toISOString(),
      status: "active",
      likesCount: 3,
      chatCount: 1,
      isBoosted: true,
      distance: 2.1,
    }),
    category: "디지털/가전",
    images: [],
    description: "거의 새 제품이에요.",
    viewCount: 42,
    seller: {
      id: "s3",
      nickname: "판매자C",
      avatar: "",
      location: "Cebu · Lahug",
      mannerTemp: 36.2,
    },
  },
  {
    ...base({
      id: "4",
      title: "책상 의자",
      price: 80000,
      location: "Manila · Malate",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24 * 2).toISOString(),
      status: "sold",
      likesCount: 7,
      chatCount: 2,
      isBoosted: false,
      distance: 0.8,
    }),
    category: "가구",
    images: [],
    description: "이사로 인해 판매합니다.",
    viewCount: 89,
    seller: {
      id: "s4",
      nickname: "판매자D",
      avatar: "",
      location: "Manila · Malate",
      mannerTemp: 36.5,
    },
  },
  {
    ...base({
      id: "5",
      title: "갤럭시 S24",
      price: 950000,
      location: "Quezon City · Diliman",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 5).toISOString(),
      status: "active",
      likesCount: 18,
      chatCount: 6,
      isBoosted: false,
      distance: 1.5,
    }),
    category: "디지털/가전",
    images: [],
    description: "256GB, 충전기 포함.",
    viewCount: 201,
    seller: {
      id: "s5",
      nickname: "판매자E",
      avatar: "",
      location: "Quezon City · Diliman",
      mannerTemp: 36.9,
    },
  },
  // 5단계: 내상품 관리용 mock (sellerId "me")
  {
    ...base({
      id: "my-1",
      title: "에어팟 프로 2세대",
      price: 180000,
      location: "Manila · Malate",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 5).toISOString(),
      status: "active",
      likesCount: 2,
      chatCount: 1,
      isBoosted: false,
      distance: 0.5,
    }),
    sellerId: "me",
    updatedAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 5).toISOString(),
    category: "디지털기기",
    images: [],
    description: "거의 새 제품입니다.",
    viewCount: 15,
    seller: {
      id: "me",
      nickname: "나",
      avatar: "",
      location: "Manila · Malate",
      mannerTemp: 36.5,
    },
  },
  {
    ...base({
      id: "my-2",
      title: "아이패드 10세대 케이스",
      price: 25000,
      location: "Manila · Malate",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24 * 2).toISOString(),
      status: "reserved",
      likesCount: 0,
      chatCount: 2,
      isBoosted: false,
      distance: 0.5,
    }),
    sellerId: "me",
    updatedAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24).toISOString(),
    category: "디지털기기",
    images: [],
    description: "예약 중이에요.",
    viewCount: 8,
    seller: {
      id: "me",
      nickname: "나",
      avatar: "",
      location: "Manila · Malate",
      mannerTemp: 36.5,
    },
  },
  {
    ...base({
      id: "my-3",
      title: "무선 키보드",
      price: 45000,
      location: "Manila · Malate",
      createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24 * 5).toISOString(),
      status: "sold",
      likesCount: 3,
      chatCount: 1,
      isBoosted: false,
      distance: 0.5,
    }),
    sellerId: "me",
    updatedAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24).toISOString(),
    category: "디지털기기",
    images: [],
    description: "판매 완료.",
    viewCount: 22,
    seller: {
      id: "me",
      nickname: "나",
      avatar: "",
      location: "Manila · Malate",
      mannerTemp: 36.5,
    },
  },
];

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

/** 12단계: 관리자 상품 상태 변경(블라인드/삭제 등) */
export function setProductStatus(
  id: string,
  status: Product["status"]
): boolean {
  const p = MOCK_PRODUCTS.find((x) => x.id === id);
  if (!p) return false;
  p.status = status;
  p.updatedAt = new Date().toISOString();
  return true;
}

/**
 * 4단계: 폼 payload로 새 상품 mock 추가 (Supabase insert 대체용)
 * 등록 상품은 seller placeholder로 두어 내상품 관리 연동 시 사용
 */
export function addMockProduct(payload: {
  title: string;
  price: number;
  location: string;
  thumbnailUrl: string;
  category: string;
  description: string;
}): string {
  const id = "mock-" + Date.now();
  const product: Product = {
    ...base({
      id,
      title: payload.title,
      price: payload.price,
      location: payload.location,
      createdAt: new Date().toISOString(),
      status: "active",
    }),
    thumbnail: payload.thumbnailUrl || "",
    category: payload.category,
    images: payload.thumbnailUrl ? [payload.thumbnailUrl] : [],
    description: payload.description ?? "",
    viewCount: 0,
    seller: {
      id: "me",
      nickname: "나",
      avatar: "",
      location: payload.location,
      mannerTemp: 36.5,
    },
  };
  product.sellerId = "me";
  MOCK_PRODUCTS.push(product);
  return id;
}

/** 5단계: 로그인 사용자 mock (내상품 필터용) */
export const CURRENT_USER_ID = "me";

/** 5단계: 홈 리스트용 — hidden·blinded·deleted 제외. 8단계: regionName 있으면 해당 지역만 */
export function getProductsForHome(regionName?: string): Product[] {
  const exclude = ["hidden", "blinded", "deleted"] as const;
  let list = MOCK_PRODUCTS.filter((p) => !exclude.includes(p.status as typeof exclude[number]));
  if (regionName?.trim()) {
    list = list.filter((p) => p.location.includes(regionName.trim()));
  }
  return list;
}

/** 폼 payload → addMockProduct 인자 (등록 페이지 / Supabase 대체용) */
export function saveProductFromFormPayload(payload: ProductFormPayload): string {
  const priceNum = Number(payload.price) || 0;
  const location = getLocationLabel(payload.region, payload.city);
  return addMockProduct({
    title: payload.title,
    price: priceNum,
    location,
    thumbnailUrl: "", // mock: 실제 업로드 전까지 빈 문자열
    category: payload.category,
    description: payload.description,
  });
}

import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "./types";

export const BROWSE_PRIMARY_INDUSTRIES: BrowsePrimaryIndustry[] = [
  { id: "p-restaurant", slug: "restaurant", nameKo: "식당", sortOrder: 0, symbol: "🍽️" },
  { id: "p-mart", slug: "mart", nameKo: "마트", sortOrder: 10, symbol: "🛒" },
  { id: "p-hardware", slug: "hardware", nameKo: "공구류", sortOrder: 20, symbol: "🔧" },
  { id: "p-pet", slug: "pet", nameKo: "펫샵", sortOrder: 30, symbol: "🐾" },
  { id: "p-cafe", slug: "cafe", nameKo: "카페", sortOrder: 40, symbol: "☕" },
  { id: "p-beauty", slug: "beauty", nameKo: "미용", sortOrder: 50, symbol: "💇" },
  { id: "p-academy", slug: "academy", nameKo: "학원", sortOrder: 60, symbol: "📚" },
  { id: "p-life", slug: "life", nameKo: "생활서비스", sortOrder: 70, symbol: "🧹" },
];

const sub = (
  id: string,
  slug: string,
  nameKo: string,
  primarySlug: string,
  sortOrder: number
): BrowseSubIndustry => ({ id, slug, nameKo, primarySlug, sortOrder });

/** 2차 업종 전체 (primarySlug 로 필터) */
export const BROWSE_SUB_INDUSTRIES: BrowseSubIndustry[] = [
  // 식당
  sub("s-korean", "korean", "한식", "restaurant", 0),
  sub("s-chinese", "chinese", "중식", "restaurant", 10),
  sub("s-western", "western", "양식", "restaurant", 20),
  sub("s-snack", "snack", "분식", "restaurant", 30),
  sub("s-chicken", "chicken", "치킨", "restaurant", 40),
  sub("s-pizza", "pizza", "피자", "restaurant", 50),
  sub("s-dessert", "dessert", "디저트", "restaurant", 60),
  // 마트
  sub("m-korean", "korean-mart", "한인마트", "mart", 0),
  sub("m-local", "local-mart", "로컬마트", "mart", 10),
  sub("m-meat", "meat", "정육", "mart", 20),
  sub("m-sea", "seafood", "수산", "mart", 30),
  sub("m-side", "side-dish", "반찬", "mart", 40),
  sub("m-fruit", "fruit", "과일", "mart", 50),
  // 공구류
  sub("h-power", "power-tools", "전동공구", "hardware", 0),
  sub("h-hand", "hand-tools", "수공구", "hardware", 10),
  sub("h-metal", "metal", "철물", "hardware", 20),
  sub("h-safety", "safety", "안전용품", "hardware", 30),
  sub("h-build", "building", "건축자재", "hardware", 40),
  // 펫샵
  sub("pet-food", "pet-food", "사료", "pet", 0),
  sub("pet-snack", "pet-snack", "간식", "pet", 10),
  sub("pet-groom", "pet-groom", "미용", "pet", 20),
  sub("pet-hospital", "pet-hospital", "병원연계", "pet", 30),
  sub("pet-goods", "pet-goods", "용품", "pet", 40),
  // 카페 · 미용 · 학원 · 생활 (탐색용 최소 하위)
  sub("c-coffee", "coffee", "커피", "cafe", 0),
  sub("c-bakery", "bakery", "베이커리", "cafe", 10),
  sub("c-brunch", "brunch", "브런치", "cafe", 20),
  sub("b-hair", "hair", "헤어", "beauty", 0),
  sub("b-nail", "nail", "네일", "beauty", 10),
  sub("b-skin", "skin", "스킨케어", "beauty", 20),
  sub("a-lang", "language", "어학", "academy", 0),
  sub("a-music", "music", "음악", "academy", 10),
  sub("a-sports", "sports", "운동", "academy", 20),
  sub("l-clean", "cleaning", "청소", "life", 0),
  sub("l-laundry", "laundry", "세탁", "life", 10),
  sub("l-repair", "repair", "수리", "life", 20),
];

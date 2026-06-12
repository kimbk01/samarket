/**
 * 어드민 taxonomy 시드 — POST `/api/admin/stores/taxonomy` `{ seed: true }` 전용.
 * 런타임 UI authoritative 소스는 GET `/api/stores/taxonomy` (DB).
 */
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";

export const BROWSE_PRIMARY_INDUSTRIES: BrowsePrimaryIndustry[] = [
  { id: "p-restaurant", slug: "restaurant", nameKo: "식당", nameEn: "Restaurant", sortOrder: 0, symbol: "🍽️" },
  { id: "p-mart", slug: "mart", nameKo: "마트", nameEn: "Mart", sortOrder: 10, symbol: "🛒" },
  { id: "p-hardware", slug: "hardware", nameKo: "공구류", nameEn: "Hardware", sortOrder: 20, symbol: "🔧" },
  { id: "p-pet", slug: "pet", nameKo: "펫샵", nameEn: "Pet shop", sortOrder: 30, symbol: "🐾" },
  { id: "p-cafe", slug: "cafe", nameKo: "카페", nameEn: "Cafe", sortOrder: 40, symbol: "☕" },
  { id: "p-beauty", slug: "beauty", nameKo: "미용", nameEn: "Beauty", sortOrder: 50, symbol: "💇" },
  { id: "p-academy", slug: "academy", nameKo: "학원", nameEn: "Academy", sortOrder: 60, symbol: "📚" },
  { id: "p-life", slug: "life", nameKo: "서비스", nameEn: "Services", sortOrder: 70, symbol: "🧹" },
];

const sub = (
  id: string,
  slug: string,
  nameKo: string,
  primarySlug: string,
  sortOrder: number,
  nameEn: string,
): BrowseSubIndustry => ({ id, slug, nameKo, nameEn, primarySlug, sortOrder });

export const BROWSE_SUB_INDUSTRIES: BrowseSubIndustry[] = [
  sub("s-korean", "korean", "한식", "restaurant", 0, "Korean"),
  sub("s-chinese", "chinese", "중식", "restaurant", 10, "Chinese"),
  sub("s-western", "western", "양식", "restaurant", 20, "Western"),
  sub("s-snack", "snack", "분식", "restaurant", 30, "Snacks"),
  sub("s-chicken", "chicken", "치킨", "restaurant", 40, "Chicken"),
  sub("s-pizza", "pizza", "피자", "restaurant", 50, "Pizza"),
  sub("s-dessert", "dessert", "디저트", "restaurant", 60, "Dessert"),
  sub("m-korean", "korean-mart", "한인마트", "mart", 0, "Korean mart"),
  sub("m-local", "local-mart", "로컬마트", "mart", 10, "Local mart"),
  sub("m-meat", "meat", "정육", "mart", 20, "Butcher"),
  sub("m-sea", "seafood", "수산", "mart", 30, "Seafood"),
  sub("m-side", "side-dish", "반찬", "mart", 40, "Side dishes"),
  sub("m-fruit", "fruit", "과일", "mart", 50, "Fruit"),
  sub("h-power", "power-tools", "전동공구", "hardware", 0, "Power tools"),
  sub("h-hand", "hand-tools", "수공구", "hardware", 10, "Hand tools"),
  sub("h-metal", "metal", "철물", "hardware", 20, "Metal goods"),
  sub("h-safety", "safety", "안전용품", "hardware", 30, "Safety gear"),
  sub("h-build", "building", "건축자재", "hardware", 40, "Building materials"),
  sub("pet-food", "pet-food", "사료", "pet", 0, "Pet food"),
  sub("pet-snack", "pet-snack", "간식", "pet", 10, "Pet treats"),
  sub("pet-groom", "pet-groom", "미용", "pet", 20, "Grooming"),
  sub("pet-hospital", "pet-hospital", "병원연계", "pet", 30, "Vet referral"),
  sub("pet-goods", "pet-goods", "용품", "pet", 40, "Pet supplies"),
  sub("c-coffee", "coffee", "커피", "cafe", 0, "Coffee"),
  sub("c-bakery", "bakery", "베이커리", "cafe", 10, "Bakery"),
  sub("c-brunch", "brunch", "브런치", "cafe", 20, "Brunch"),
  sub("b-hair", "hair", "헤어", "beauty", 0, "Hair"),
  sub("b-nail", "nail", "네일", "beauty", 10, "Nails"),
  sub("b-skin", "skin", "스킨케어", "beauty", 20, "Skincare"),
  sub("a-lang", "language", "어학", "academy", 0, "Language"),
  sub("a-music", "music", "음악", "academy", 10, "Music"),
  sub("a-sports", "sports", "운동", "academy", 20, "Sports"),
  sub("l-clean", "cleaning", "청소", "life", 0, "Cleaning"),
  sub("l-laundry", "laundry", "세탁", "life", 10, "Laundry"),
  sub("l-repair", "repair", "수리", "life", 20, "Repair"),
];

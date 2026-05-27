/**
 * `/stores` 홈 taxonomy 정적 seed — **테스트·문서용**. 런타임 `/stores` UI 에 사용 금지.
 * admin `/admin/stores/application-settings?menu=stores` → GET `/api/stores/taxonomy` 만 authoritative.
 */
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import type { StoresHomeTaxonomyState } from "@/lib/stores/stores-home-taxonomy-client";

const SEED_CATEGORY_IDS: Record<string, string> = {
  restaurant: "seed-c-restaurant",
  mart: "seed-c-mart",
  hardware: "seed-c-hardware",
  pet: "seed-c-pet",
  cafe: "seed-c-cafe",
  beauty: "seed-c-beauty",
  academy: "seed-c-academy",
  life: "seed-c-life",
};

type SeedPrimary = {
  slug: string;
  name: string;
  name_en: string;
  sort_order: number;
};

type SeedTopic = {
  slug: string;
  name: string;
  name_en: string;
  primarySlug: string;
  sort_order: number;
};

const SEED_PRIMARIES: SeedPrimary[] = [
  { slug: "restaurant", name: "식당", name_en: "Restaurant", sort_order: 0 },
  { slug: "mart", name: "마트", name_en: "Mart", sort_order: 10 },
  { slug: "hardware", name: "공구류", name_en: "Hardware", sort_order: 20 },
  { slug: "pet", name: "펫샵", name_en: "Pet shop", sort_order: 30 },
  { slug: "cafe", name: "카페", name_en: "Cafe", sort_order: 40 },
  { slug: "beauty", name: "미용", name_en: "Beauty", sort_order: 50 },
  { slug: "academy", name: "학원", name_en: "Academy", sort_order: 60 },
  { slug: "life", name: "서비스", name_en: "Services", sort_order: 70 },
];

const SEED_TOPICS: SeedTopic[] = [
  { slug: "korean", name: "한식", name_en: "Korean", primarySlug: "restaurant", sort_order: 0 },
  { slug: "chinese", name: "중식", name_en: "Chinese", primarySlug: "restaurant", sort_order: 10 },
  { slug: "japanese", name: "일식", name_en: "Japanese", primarySlug: "restaurant", sort_order: 20 },
  { slug: "western", name: "양식", name_en: "Western", primarySlug: "restaurant", sort_order: 30 },
  { slug: "pizza", name: "피자", name_en: "Pizza", primarySlug: "restaurant", sort_order: 40 },
  { slug: "snack", name: "분식", name_en: "Snacks", primarySlug: "restaurant", sort_order: 50 },
  { slug: "chicken", name: "치킨", name_en: "Chicken", primarySlug: "restaurant", sort_order: 60 },
  { slug: "lunchbox", name: "도시락", name_en: "Lunchbox", primarySlug: "restaurant", sort_order: 70 },
  { slug: "local", name: "로컬", name_en: "Local", primarySlug: "restaurant", sort_order: 80 },
  { slug: "dessert", name: "디저트", name_en: "Dessert", primarySlug: "restaurant", sort_order: 90 },
  { slug: "late_night", name: "야식", name_en: "Late night", primarySlug: "restaurant", sort_order: 100 },
  { slug: "korean-mart", name: "한인마트", name_en: "Korean mart", primarySlug: "mart", sort_order: 0 },
  { slug: "local-mart", name: "로컬마트", name_en: "Local mart", primarySlug: "mart", sort_order: 10 },
  { slug: "meat", name: "정육", name_en: "Butcher", primarySlug: "mart", sort_order: 20 },
  { slug: "seafood", name: "수산", name_en: "Seafood", primarySlug: "mart", sort_order: 30 },
  { slug: "side-dish", name: "반찬", name_en: "Side dishes", primarySlug: "mart", sort_order: 40 },
  { slug: "fruit", name: "과일", name_en: "Fruit", primarySlug: "mart", sort_order: 50 },
  { slug: "power-tools", name: "전동공구", name_en: "Power tools", primarySlug: "hardware", sort_order: 0 },
  { slug: "hand-tools", name: "수공구", name_en: "Hand tools", primarySlug: "hardware", sort_order: 10 },
  { slug: "metal", name: "철물", name_en: "Metal goods", primarySlug: "hardware", sort_order: 20 },
  { slug: "safety", name: "안전용품", name_en: "Safety gear", primarySlug: "hardware", sort_order: 30 },
  { slug: "building", name: "건축자재", name_en: "Building materials", primarySlug: "hardware", sort_order: 40 },
  { slug: "pet-food", name: "사료", name_en: "Pet food", primarySlug: "pet", sort_order: 0 },
  { slug: "pet-snack", name: "간식", name_en: "Pet treats", primarySlug: "pet", sort_order: 10 },
  { slug: "pet-groom", name: "미용", name_en: "Grooming", primarySlug: "pet", sort_order: 20 },
  { slug: "pet-hospital", name: "병원연계", name_en: "Vet referral", primarySlug: "pet", sort_order: 30 },
  { slug: "pet-goods", name: "용품", name_en: "Pet supplies", primarySlug: "pet", sort_order: 40 },
  { slug: "coffee", name: "커피", name_en: "Coffee", primarySlug: "cafe", sort_order: 0 },
  { slug: "bakery", name: "베이커리", name_en: "Bakery", primarySlug: "cafe", sort_order: 10 },
  { slug: "brunch", name: "브런치", name_en: "Brunch", primarySlug: "cafe", sort_order: 20 },
  { slug: "hair", name: "헤어", name_en: "Hair", primarySlug: "beauty", sort_order: 0 },
  { slug: "nail", name: "네일", name_en: "Nails", primarySlug: "beauty", sort_order: 10 },
  { slug: "skin", name: "스킨케어", name_en: "Skincare", primarySlug: "beauty", sort_order: 20 },
  { slug: "language", name: "어학", name_en: "Language", primarySlug: "academy", sort_order: 0 },
  { slug: "music", name: "음악", name_en: "Music", primarySlug: "academy", sort_order: 10 },
  { slug: "sports", name: "운동", name_en: "Sports", primarySlug: "academy", sort_order: 20 },
  { slug: "cleaning", name: "청소", name_en: "Cleaning", primarySlug: "life", sort_order: 0 },
  { slug: "laundry", name: "세탁", name_en: "Laundry", primarySlug: "life", sort_order: 10 },
  { slug: "repair", name: "수리", name_en: "Repair", primarySlug: "life", sort_order: 20 },
];

/** above-the-fold taxonomy 아이콘 eager — 첫 1장만(LCP 경쟁 완화), 나머지 lazy */
export const STORES_HOME_TAXONOMY_EAGER_ICON_COUNT = 1;

function buildSeedCategories(): StoreTaxonomyCategory[] {
  return SEED_PRIMARIES.map((row) => ({
    id: SEED_CATEGORY_IDS[row.slug],
    slug: row.slug,
    name: row.name,
    name_en: row.name_en,
    sort_order: row.sort_order,
    image_url: null,
    is_active: true,
  }));
}

function buildSeedTopics(): StoreTaxonomyTopic[] {
  return SEED_TOPICS.map((row) => ({
    id: `seed-t-${row.primarySlug}-${row.slug}`,
    store_category_id: SEED_CATEGORY_IDS[row.primarySlug],
    slug: row.slug,
    name: row.name,
    name_en: row.name_en,
    sort_order: row.sort_order,
    image_url: null,
    is_active: true,
  }));
}

let seedStateCache: StoresHomeTaxonomyState | null = null;

/** 동기 seed — 홈 카테고리 첫 페인트용 */
export function getStoresHomeTaxonomySeedState(): StoresHomeTaxonomyState {
  if (!seedStateCache) {
    seedStateCache = {
      categories: buildSeedCategories(),
      topics: buildSeedTopics(),
    };
  }
  return seedStateCache;
}

/** GET /api/stores/taxonomy 와 동일 top-level shape (테스트·캐시 문서용) */
export function buildStoresHomeTaxonomySeedApiJson(): {
  ok: true;
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  subtopics: [];
} {
  const state = getStoresHomeTaxonomySeedState();
  return {
    ok: true,
    categories: state.categories,
    topics: state.topics,
    subtopics: [],
  };
}

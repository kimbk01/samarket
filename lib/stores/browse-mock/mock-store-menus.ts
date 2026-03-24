import type { BrowseMenuGroup } from "./types";

/** store slug → 메뉴 그룹 (store_products 그룹핑 시뮬) */
export const BROWSE_MOCK_MENU_GROUPS_BY_STORE_SLUG: Record<string, BrowseMenuGroup[]> = {
  "seoul-korean-house": [
    {
      id: "g1",
      nameKo: "찌개류",
      items: [
        { name: "김치찌개", price: 250 },
        { name: "된장찌개", price: 230 },
        { name: "순두부찌개", price: 260 },
      ],
    },
    {
      id: "g2",
      nameKo: "식사류",
      items: [
        { name: "불고기정식", price: 320 },
        { name: "제육덮밥", price: 220 },
        { name: "비빔밥", price: 210 },
      ],
    },
    {
      id: "g3",
      nameKo: "추가메뉴",
      items: [
        { name: "공기밥", price: 30 },
        { name: "계란말이", price: 120 },
        { name: "음료", price: 50 },
      ],
    },
  ],
  "hk-style-house": [
    {
      id: "g1",
      nameKo: "면류",
      items: [
        { name: "짜장면", price: 180 },
        { name: "짬뽕", price: 220 },
        { name: "우동", price: 210 },
      ],
    },
    {
      id: "g2",
      nameKo: "요리류",
      items: [
        { name: "탕수육 소", price: 380 },
        { name: "깐풍기", price: 430 },
        { name: "마파두부", price: 260 },
      ],
    },
    {
      id: "g3",
      nameKo: "세트",
      items: [
        { name: "짜장면+탕수육", price: 490 },
        { name: "짬뽕+군만두", price: 430 },
      ],
    },
  ],
  "mom-hand-snack": [
    {
      id: "g1",
      nameKo: "분식",
      items: [
        { name: "떡볶이", price: 120 },
        { name: "참치김밥", price: 140 },
        { name: "모듬튀김", price: 180 },
        { name: "라볶이", price: 150 },
      ],
    },
  ],
  "china-wok": [
    {
      id: "g1",
      nameKo: "볶음·밥",
      items: [
        { name: "볶음밥", price: 200 },
        { name: "마파두부", price: 260 },
        { name: "깐풍기", price: 420 },
      ],
    },
  ],
  "pasta-grill-house": [
    {
      id: "g1",
      nameKo: "파스타",
      items: [
        { name: "까보나라", price: 290 },
        { name: "알리오올리오", price: 270 },
      ],
    },
    {
      id: "g2",
      nameKo: "그릴·샐러드",
      items: [
        { name: "비프스테이크", price: 680 },
        { name: "시저샐러드", price: 240 },
      ],
    },
  ],
  "korea-snackbar": [
    {
      id: "g1",
      nameKo: "분식",
      items: [
        { name: "라볶이", price: 160 },
        { name: "순대", price: 170 },
        { name: "치즈떡볶이", price: 190 },
      ],
    },
  ],
  "seoul-mart": [
    {
      id: "g1",
      nameKo: "인기 상품",
      items: [
        { name: "신라면", price: 45 },
        { name: "고추장", price: 180 },
        { name: "냉동만두", price: 220 },
      ],
    },
  ],
  "fresh-local-mart": [
    {
      id: "g1",
      nameKo: "신선",
      items: [
        { name: "계란 12구", price: 95 },
        { name: "바나나", price: 60 },
        { name: "생수", price: 35 },
      ],
    },
  ],
  "tool-master": [
    {
      id: "g1",
      nameKo: "전동공구",
      items: [
        { name: "전동드릴", price: 2200 },
        { name: "그라인더", price: 1800 },
        { name: "충전배터리", price: 950 },
      ],
    },
  ],
  "safety-build": [
    {
      id: "g1",
      nameKo: "안전용품",
      items: [
        { name: "안전모", price: 350 },
        { name: "작업장갑", price: 80 },
        { name: "안전조끼", price: 240 },
      ],
    },
  ],
  "happy-pet-house": [
    {
      id: "g1",
      nameKo: "사료·간식",
      items: [
        { name: "강아지 사료", price: 750 },
        { name: "고양이 사료", price: 680 },
        { name: "간식팩", price: 150 },
      ],
    },
  ],
  "pet-grooming-care": [
    {
      id: "g1",
      nameKo: "케어",
      items: [
        { name: "소형견 미용", price: 600 },
        { name: "목욕", price: 350 },
        { name: "발톱정리", price: 120 },
      ],
    },
  ],
  "corner-coffee-lab": [
    {
      id: "g1",
      nameKo: "커피",
      items: [
        { name: "아메리카노", price: 140 },
        { name: "카페라떼", price: 170 },
        { name: "콜드브루", price: 160 },
      ],
    },
  ],
};

export function getBrowseMockMenuGroupsByStoreSlug(storeSlug: string): BrowseMenuGroup[] {
  return BROWSE_MOCK_MENU_GROUPS_BY_STORE_SLUG[storeSlug.trim()] ?? [];
}

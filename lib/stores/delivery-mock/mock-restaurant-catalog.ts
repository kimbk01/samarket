import { allowSampleRestaurantDeliveryFlow } from "@/lib/config/deploy-surface";
import type {
  DeliveryMenuCategory,
  DeliveryMenuItem,
  DeliveryMenuOptionGroup,
  RestaurantDeliveryCatalog,
  RestaurantDeliveryProfile,
} from "./types";

function og(
  id: string,
  nameKo: string,
  minSelect: number,
  maxSelect: number,
  options: { id: string; name: string; priceDelta: number }[]
): DeliveryMenuOptionGroup {
  return { id, nameKo, minSelect, maxSelect, options };
}

function mi(
  id: string,
  storeId: string,
  categoryId: string,
  name: string,
  price: number,
  opts: {
    description?: string;
    isSoldOut?: boolean;
    isPopular?: boolean;
    isRecommended?: boolean;
    displayOrder?: number;
    optionGroups?: DeliveryMenuOptionGroup[];
  } = {}
): DeliveryMenuItem {
  return {
    id,
    storeId,
    categoryId,
    name,
    description: opts.description,
    image: null,
    price,
    isSoldOut: opts.isSoldOut ?? false,
    isPopular: opts.isPopular ?? false,
    isRecommended: opts.isRecommended ?? false,
    displayOrder: opts.displayOrder ?? 0,
    optionGroups: opts.optionGroups ?? [],
  };
}

const SPICE_GROUP = (prefix: string) =>
  og(`${prefix}-spice`, "맵기", 1, 1, [
    { id: `${prefix}-sp-mild`, name: "순한맛", priceDelta: 0 },
    { id: `${prefix}-sp-norm`, name: "보통맛", priceDelta: 0 },
    { id: `${prefix}-sp-hot`, name: "매운맛", priceDelta: 10 },
  ]);

const SPICE_GROUP_SNACK = (prefix: string) =>
  og(`${prefix}-spice`, "맵기", 1, 1, [
    { id: `${prefix}-sp-mild`, name: "순한맛", priceDelta: 0 },
    { id: `${prefix}-sp-norm`, name: "보통맛", priceDelta: 0 },
    { id: `${prefix}-sp-xhot`, name: "아주매운맛", priceDelta: 20 },
  ]);

const KIMCHI_OPTIONS: DeliveryMenuOptionGroup[] = [
  og("seoul-kimchi-spice", "맵기", 1, 1, [
    { id: "seoul-k-sp-mild", name: "순한맛", priceDelta: 0 },
    { id: "seoul-k-sp-norm", name: "보통맛", priceDelta: 0 },
    { id: "seoul-k-sp-hot", name: "매운맛", priceDelta: 10 },
  ]),
  og("seoul-kimchi-add", "추가", 0, 3, [
    { id: "seoul-k-add-egg", name: "계란추가", priceDelta: 20 },
    { id: "seoul-k-add-rice", name: "공기밥추가", priceDelta: 30 },
    { id: "seoul-k-add-chz", name: "치즈추가", priceDelta: 25 },
  ]),
];

const JJAJANG_OPTIONS: DeliveryMenuOptionGroup[] = [
  og("hk-jj-size", "곱빼기", 1, 1, [
    { id: "hk-jj-norm", name: "보통", priceDelta: 0 },
    { id: "hk-jj-extra", name: "곱빼기", priceDelta: 40 },
  ]),
  og("hk-jj-extra-menu", "추가메뉴", 0, 2, [
    { id: "hk-jj-dumpling", name: "군만두 5개", priceDelta: 80 },
    { id: "hk-jj-coke", name: "콜라", priceDelta: 50 },
  ]),
];

const TTEOK_OPTIONS: DeliveryMenuOptionGroup[] = [
  SPICE_GROUP_SNACK("snack-tteok"),
  og("snack-tteok-top", "추가토핑", 0, 3, [
    { id: "snack-t-chz", name: "치즈", priceDelta: 30 },
    { id: "snack-t-egg", name: "계란", priceDelta: 20 },
    { id: "snack-t-fish", name: "오뎅추가", priceDelta: 25 },
  ]),
];

const MOM_TTEOK_OPTIONS: DeliveryMenuOptionGroup[] = [
  og("mom-tteok-spice", "맵기", 1, 1, [
    { id: "mom-t-sp-mild", name: "순한맛", priceDelta: 0 },
    { id: "mom-t-sp-norm", name: "보통맛", priceDelta: 0 },
    { id: "mom-t-sp-xhot", name: "아주매운맛", priceDelta: 20 },
  ]),
  og("mom-tteok-top", "추가토핑", 0, 3, [
    { id: "mom-t-chz", name: "치즈", priceDelta: 30 },
    { id: "mom-t-egg", name: "계란", priceDelta: 20 },
    { id: "mom-t-fish", name: "오뎅추가", priceDelta: 25 },
  ]),
];

function sortItems(items: DeliveryMenuItem[]) {
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

function cat(id: string, nameKo: string, sortOrder: number, items: DeliveryMenuItem[]): DeliveryMenuCategory {
  return { id, nameKo, sortOrder, items: sortItems(items) };
}

const profile = (
  min: number,
  fee: number,
  prep: string,
  delivery = true,
  pickup = true
): RestaurantDeliveryProfile => ({
  minOrderAmount: min,
  deliveryFee: fee,
  deliveryAvailable: delivery,
  pickupAvailable: pickup,
  estPrepTimeLabel: prep,
});

export const RESTAURANT_DELIVERY_CATALOGS: Record<string, RestaurantDeliveryCatalog> = {
  "seoul-korean-house": {
    storeId: "mock-seoul-korean",
    storeSlug: "seoul-korean-house",
    profile: profile(300, 50, "25~35분"),
    categories: [
      cat("c-stew", "찌개류", 0, [
        mi("m-seoul-kimchi", "mock-seoul-korean", "c-stew", "김치찌개", 250, {
          isRecommended: true,
          displayOrder: 0,
          optionGroups: KIMCHI_OPTIONS,
        }),
        mi("m-seoul-doenjang", "mock-seoul-korean", "c-stew", "된장찌개", 230, {
          displayOrder: 1,
          optionGroups: [SPICE_GROUP("seoul-dj")],
        }),
        mi("m-seoul-sundubu", "mock-seoul-korean", "c-stew", "순두부찌개", 260, {
          displayOrder: 2,
          optionGroups: [SPICE_GROUP("seoul-sd")],
        }),
      ]),
      cat("c-meal", "식사류", 10, [
        mi("m-seoul-bulgogi", "mock-seoul-korean", "c-meal", "불고기정식", 320, {
          isPopular: true,
          displayOrder: 0,
        }),
        mi("m-seoul-pork", "mock-seoul-korean", "c-meal", "제육덮밥", 220, { displayOrder: 1 }),
        mi("m-seoul-bibim", "mock-seoul-korean", "c-meal", "비빔밥", 210, { displayOrder: 2 }),
      ]),
      cat("c-side", "추가메뉴", 20, [
        mi("m-seoul-eggroll", "mock-seoul-korean", "c-side", "계란말이", 120, { displayOrder: 0 }),
        mi("m-seoul-rice", "mock-seoul-korean", "c-side", "공기밥", 30, { displayOrder: 1 }),
        mi("m-seoul-drink", "mock-seoul-korean", "c-side", "음료", 50, { displayOrder: 2 }),
      ]),
    ],
  },

  "hk-style-house": {
    storeId: "mock-hk-style",
    storeSlug: "hk-style-house",
    profile: profile(350, 60, "20~30분"),
    categories: [
      cat("c-noodle", "면류", 0, [
        mi("m-hk-jjajang", "mock-hk-style", "c-noodle", "짜장면", 180, {
          isRecommended: true,
          displayOrder: 0,
          optionGroups: JJAJANG_OPTIONS,
        }),
        mi("m-hk-jjam", "mock-hk-style", "c-noodle", "짬뽕", 220, {
          displayOrder: 1,
          optionGroups: [SPICE_GROUP("hk-jjam")],
        }),
        mi("m-hk-udon", "mock-hk-style", "c-noodle", "우동", 210, { displayOrder: 2 }),
      ]),
      cat("c-dish", "요리류", 10, [
        mi("m-hk-tang", "mock-hk-style", "c-dish", "탕수육 소", 380, { isPopular: true, displayOrder: 0 }),
        mi("m-hk-kkan", "mock-hk-style", "c-dish", "깐풍기", 430, { displayOrder: 1 }),
        mi("m-hk-mapo", "mock-hk-style", "c-dish", "마파두부", 260, { displayOrder: 2 }),
      ]),
      cat("c-set", "세트", 20, [
        mi("m-hk-set1", "mock-hk-style", "c-set", "짜장면+탕수육", 490, { displayOrder: 0 }),
        mi("m-hk-set2", "mock-hk-style", "c-set", "짬뽕+군만두", 430, { displayOrder: 1 }),
      ]),
      cat("c-side", "단품", 30, [
        mi("m-hk-dumpling", "mock-hk-style", "c-side", "군만두", 120, { displayOrder: 0 }),
      ]),
    ],
  },

  "pasta-grill-house": {
    storeId: "mock-pasta-grill",
    storeSlug: "pasta-grill-house",
    profile: profile(500, 80, "30~45분"),
    categories: [
      cat("c-pasta", "파스타", 0, [
        mi("m-pasta-carbo", "mock-pasta-grill", "c-pasta", "까보나라", 290, {
          isRecommended: true,
          displayOrder: 0,
          optionGroups: [
            og("pasta-size", "사이즈", 1, 1, [
              { id: "pz-r", name: "레귤러", priceDelta: 0 },
              { id: "pz-l", name: "라지", priceDelta: 50 },
            ]),
          ],
        }),
        mi("m-pasta-aglio", "mock-pasta-grill", "c-pasta", "알리오올리오", 270, { displayOrder: 1 }),
      ]),
      cat("c-grill", "그릴·샐러드", 10, [
        mi("m-pasta-steak", "mock-pasta-grill", "c-grill", "비프스테이크", 680, {
          isPopular: true,
          displayOrder: 0,
        }),
        mi("m-pasta-salad", "mock-pasta-grill", "c-grill", "시저샐러드", 240, { displayOrder: 1 }),
      ]),
    ],
  },

  "korea-snackbar": {
    storeId: "mock-korea-snackbar",
    storeSlug: "korea-snackbar",
    profile: profile(200, 40, "15~25분"),
    categories: [
      cat("c-snack", "분식", 0, [
        mi("m-snack-tteok", "mock-korea-snackbar", "c-snack", "떡볶이", 120, {
          isRecommended: true,
          displayOrder: 0,
          optionGroups: TTEOK_OPTIONS,
        }),
        mi("m-snack-rabok", "mock-korea-snackbar", "c-snack", "라볶이", 160, {
          displayOrder: 1,
          optionGroups: [SPICE_GROUP_SNACK("snack-rabok")],
        }),
        mi("m-snack-sundae", "mock-korea-snackbar", "c-snack", "순대", 170, { displayOrder: 2 }),
        mi("m-snack-chztteok", "mock-korea-snackbar", "c-snack", "치즈떡볶이", 190, {
          displayOrder: 3,
          optionGroups: [SPICE_GROUP_SNACK("snack-chz")],
        }),
      ]),
    ],
  },

  "mom-hand-snack": {
    storeId: "mock-mom-snack",
    storeSlug: "mom-hand-snack",
    profile: profile(250, 45, "20~30분"),
    categories: [
      cat("c-snack", "분식", 0, [
        mi("m-mom-tteok", "mock-mom-snack", "c-snack", "떡볶이", 120, {
          displayOrder: 0,
          optionGroups: MOM_TTEOK_OPTIONS,
        }),
        mi("m-mom-kimbap", "mock-mom-snack", "c-snack", "참치김밥", 140, { displayOrder: 1 }),
        mi("m-mom-fry", "mock-mom-snack", "c-snack", "모듬튀김", 180, { displayOrder: 2 }),
      ]),
    ],
  },

  "china-wok": {
    storeId: "mock-china-wok",
    storeSlug: "china-wok",
    profile: profile(400, 55, "25~40분", true, true),
    categories: [
      cat("c-wok", "볶음·밥", 0, [
        mi("m-wok-rice", "mock-china-wok", "c-wok", "볶음밥", 200, {
          isSoldOut: false,
          displayOrder: 0,
          optionGroups: [SPICE_GROUP("wok-rice")],
        }),
        mi("m-wok-mapo", "mock-china-wok", "c-wok", "마파두부", 260, { displayOrder: 1 }),
        mi("m-wok-kkan", "mock-china-wok", "c-wok", "깐풍기", 420, { isSoldOut: true, displayOrder: 2 }),
      ]),
    ],
  },
};

export function getRestaurantDeliveryCatalog(storeSlug: string): RestaurantDeliveryCatalog | null {
  return RESTAURANT_DELIVERY_CATALOGS[storeSlug.trim()] ?? null;
}

export function hasRestaurantDeliveryCatalog(storeSlug: string): boolean {
  if (!allowSampleRestaurantDeliveryFlow()) return false;
  return storeSlug.trim() in RESTAURANT_DELIVERY_CATALOGS;
}

/**
 * 거래 물품 글쓰기(TradeWriteForm) 임시 저장 — 주소 관리 이동·뒤로 가기 시에만 복원 플래그와 함께 사용.
 * @see trade-write-address-return-flag.ts
 */

import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";

const STORAGE_VERSION = 1 as const;
const KEY_PREFIX = "samarket:trade-write-form";
/** 세션과 동일 스키마 — 탭 종료·강제 종료 후에도 복구용 */
const LOCAL_KEY_PREFIX = "samarket:trade-write-form-local";

export type TradeWriteFormSessionDraftBuildArgs = {
  categoryId: string;
  skinKey: string;
  title: string;
  description: string;
  price: string;
  region: string;
  city: string;
  images: { url: string; file?: File }[];
  isFreeShare: boolean;
  isPriceOfferEnabled: boolean;
  isDirectDeal: boolean;
  tradeTopicChildId: string;
  neighborhood: string;
  buildingName: string;
  estateType: string;
  dealType: "임대" | "판매";
  deposit: string;
  monthly: string;
  managementFee: string;
  hasPremium: boolean;
  areaSqm: string;
  roomCount: string;
  bathroomCount: string;
  moveInDate: string;
  carModel: string;
  carYear: string;
  mileage: string;
  usedCarTrade: "buy" | "sell" | null;
  carHasAccident: boolean;
  salary: string;
  workPlace: string;
  workType: string;
  currency: string;
  exchangeRate: string;
  tradeChatCallPolicy: string;
  descriptionAppend: string;
  tradeMeetSpot?: TradeMeetSpotValue | null;
};

export type TradeWriteFormSessionDraftV1 = {
  v: typeof STORAGE_VERSION;
  categoryId: string;
  skinKey: string;
  title: string;
  description: string;
  price: string;
  region: string;
  city: string;
  imageUrls: string[];
  isFreeShare: boolean;
  isPriceOfferEnabled: boolean;
  isDirectDeal: boolean;
  tradeTopicChildId: string;
  neighborhood: string;
  buildingName: string;
  estateType: string;
  dealType: "임대" | "판매";
  deposit: string;
  monthly: string;
  managementFee: string;
  hasPremium: boolean;
  areaSqm: string;
  roomCount: string;
  bathroomCount: string;
  moveInDate: string;
  carModel: string;
  carYear: string;
  mileage: string;
  usedCarTrade: "buy" | "sell" | null;
  carHasAccident: boolean;
  salary: string;
  workPlace: string;
  workType: string;
  currency: string;
  exchangeRate: string;
  tradeChatCallPolicy: string;
  descriptionAppend: string;
  tradeMeetSpot?: TradeMeetSpotValue | null;
};

function storageKey(categoryId: string): string {
  return `${KEY_PREFIX}:v${STORAGE_VERSION}:${categoryId}`;
}

function localStorageKey(categoryId: string): string {
  return `${LOCAL_KEY_PREFIX}:v${STORAGE_VERSION}:${categoryId}`;
}

function readTradeWriteFormLocalDraft(categoryId: string): TradeWriteFormSessionDraftV1 | null {
  if (typeof window === "undefined" || !categoryId.trim()) return null;
  try {
    const raw = localStorage.getItem(localStorageKey(categoryId.trim()));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TradeWriteFormSessionDraftV1>;
    if (j.v !== STORAGE_VERSION || j.categoryId !== categoryId.trim()) return null;
    return j as TradeWriteFormSessionDraftV1;
  } catch {
    return null;
  }
}

function writeTradeWriteFormLocalDraft(d: TradeWriteFormSessionDraftV1): void {
  if (typeof window === "undefined" || !d.categoryId.trim()) return;
  try {
    localStorage.setItem(localStorageKey(d.categoryId.trim()), JSON.stringify(d));
  } catch {
    /* quota */
  }
}

function clearTradeWriteFormLocalDraft(categoryId: string): void {
  if (typeof window === "undefined" || !categoryId.trim()) return;
  try {
    localStorage.removeItem(localStorageKey(categoryId.trim()));
  } catch {
    /* ignore */
  }
}

/** 세션 우선(같은 탭), 없으면 로컬(이전 세션·복구) */
export function readTradeWriteFormPersistedDraft(categoryId: string): TradeWriteFormSessionDraftV1 | null {
  return readTradeWriteFormSessionDraft(categoryId) ?? readTradeWriteFormLocalDraft(categoryId);
}

function isPersistableImageUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

/** 복구 확인용 — 저장된 V1 초안이 사용자 입력으로 간주되는지 */
export function tradeWritePersistedDraftLooksFilled(d: TradeWriteFormSessionDraftV1): boolean {
  return tradeWriteSessionDraftLooksFilled({
    categoryId: d.categoryId,
    skinKey: d.skinKey,
    title: d.title ?? "",
    description: d.description ?? "",
    price: d.price ?? "",
    region: d.region ?? "",
    city: d.city ?? "",
    images: draftImagesToUploadItems(d.imageUrls ?? []),
    isFreeShare: d.isFreeShare === true,
    isPriceOfferEnabled: d.isPriceOfferEnabled === true,
    isDirectDeal: d.isDirectDeal !== false,
    tradeTopicChildId: d.tradeTopicChildId ?? "",
    neighborhood: d.neighborhood ?? "",
    buildingName: d.buildingName ?? "",
    estateType: d.estateType ?? "",
    dealType: d.dealType === "판매" ? "판매" : "임대",
    deposit: d.deposit ?? "",
    monthly: d.monthly ?? "",
    managementFee: d.managementFee ?? "",
    hasPremium: d.hasPremium === true,
    areaSqm: d.areaSqm ?? "",
    roomCount: d.roomCount ?? "",
    bathroomCount: d.bathroomCount ?? "",
    moveInDate: d.moveInDate ?? "",
    carModel: d.carModel ?? "",
    carYear: d.carYear ?? "",
    mileage: d.mileage ?? "",
    usedCarTrade: d.usedCarTrade === "buy" || d.usedCarTrade === "sell" ? d.usedCarTrade : null,
    carHasAccident: d.carHasAccident === true,
    salary: d.salary ?? "",
    workPlace: d.workPlace ?? "",
    workType: d.workType ?? "",
    currency: d.currency ?? "",
    exchangeRate: d.exchangeRate ?? "",
    tradeChatCallPolicy: d.tradeChatCallPolicy ?? "none",
    descriptionAppend: d.descriptionAppend ?? "",
    tradeMeetSpot: d.tradeMeetSpot ?? null,
  });
}

export function tradeWriteSessionDraftLooksFilled(p: TradeWriteFormSessionDraftBuildArgs): boolean {
  // region/city는 자동 채워지므로 사용자 입력으로 보지 않는다
  return Boolean(
    p.title.trim() ||
      p.description.trim() ||
      p.price.trim() ||
      p.images.length > 0 ||
      p.tradeTopicChildId.trim() ||
      p.neighborhood.trim() ||
      p.buildingName.trim() ||
      p.estateType.trim() ||
      p.deposit.trim() ||
      p.monthly.trim() ||
      p.managementFee.trim() ||
      p.areaSqm.trim() ||
      p.roomCount.trim() ||
      p.bathroomCount.trim() ||
      p.moveInDate.trim() ||
      p.carModel.trim() ||
      p.carYear.trim() ||
      p.mileage.trim() ||
      p.salary.trim() ||
      p.workPlace.trim() ||
      p.workType.trim() ||
      p.currency.trim() ||
      p.exchangeRate.trim() ||
      p.descriptionAppend.trim() ||
      p.usedCarTrade != null ||
      (p.tradeMeetSpot?.displayLine?.trim() ?? "").length > 0
  );
}

export function readTradeWriteFormSessionDraft(categoryId: string): TradeWriteFormSessionDraftV1 | null {
  if (typeof window === "undefined" || !categoryId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(categoryId.trim()));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TradeWriteFormSessionDraftV1>;
    if (j.v !== STORAGE_VERSION || j.categoryId !== categoryId.trim()) return null;
    return j as TradeWriteFormSessionDraftV1;
  } catch {
    return null;
  }
}

export function writeTradeWriteFormSessionDraft(d: TradeWriteFormSessionDraftV1): void {
  if (typeof window === "undefined" || !d.categoryId.trim()) return;
  try {
    sessionStorage.setItem(storageKey(d.categoryId.trim()), JSON.stringify(d));
  } catch {
    /* quota */
  }
  writeTradeWriteFormLocalDraft(d);
}

export function clearTradeWriteFormSessionDraft(categoryId: string): void {
  if (typeof window === "undefined" || !categoryId.trim()) return;
  try {
    sessionStorage.removeItem(storageKey(categoryId.trim()));
  } catch {
    /* ignore */
  }
  clearTradeWriteFormLocalDraft(categoryId);
}

export function buildTradeWriteFormSessionDraft(args: TradeWriteFormSessionDraftBuildArgs): TradeWriteFormSessionDraftV1 {
  const imageUrls = args.images.map((x) => x.url).filter(isPersistableImageUrl);
  return {
    v: STORAGE_VERSION,
    categoryId: args.categoryId.trim(),
    skinKey: args.skinKey,
    title: args.title,
    description: args.description,
    price: args.price,
    region: args.region,
    city: args.city,
    imageUrls,
    isFreeShare: args.isFreeShare,
    isPriceOfferEnabled: args.isPriceOfferEnabled,
    isDirectDeal: args.isDirectDeal,
    tradeTopicChildId: args.tradeTopicChildId,
    neighborhood: args.neighborhood,
    buildingName: args.buildingName,
    estateType: args.estateType,
    dealType: args.dealType,
    deposit: args.deposit,
    monthly: args.monthly,
    managementFee: args.managementFee,
    hasPremium: args.hasPremium,
    areaSqm: args.areaSqm,
    roomCount: args.roomCount,
    bathroomCount: args.bathroomCount,
    moveInDate: args.moveInDate,
    carModel: args.carModel,
    carYear: args.carYear,
    mileage: args.mileage,
    usedCarTrade: args.usedCarTrade,
    carHasAccident: args.carHasAccident,
    salary: args.salary,
    workPlace: args.workPlace,
    workType: args.workType,
    currency: args.currency,
    exchangeRate: args.exchangeRate,
    tradeChatCallPolicy: args.tradeChatCallPolicy,
    descriptionAppend: args.descriptionAppend,
    ...(args.tradeMeetSpot && args.tradeMeetSpot.displayLine.trim()
      ? { tradeMeetSpot: args.tradeMeetSpot }
      : {}),
  };
}

export function draftImagesToUploadItems(urls: string[]): { url: string }[] {
  return urls.filter(isPersistableImageUrl).map((url) => ({ url }));
}

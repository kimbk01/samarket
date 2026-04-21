/**
 * 거래 물품 글쓰기(TradeWriteForm) 임시 저장 — 주소 관리 이동·뒤로 가기 시에만 복원 플래그와 함께 사용.
 * @see trade-write-address-return-flag.ts
 */

const STORAGE_VERSION = 1 as const;
const KEY_PREFIX = "samarket:trade-write-form";

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
};

function storageKey(categoryId: string): string {
  return `${KEY_PREFIX}:v${STORAGE_VERSION}:${categoryId}`;
}

function isPersistableImageUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

export function tradeWriteSessionDraftLooksFilled(p: TradeWriteFormSessionDraftBuildArgs): boolean {
  return Boolean(
    p.title.trim() ||
      p.description.trim() ||
      p.price.trim() ||
      p.images.length > 0 ||
      (p.region.trim() && p.city.trim()) ||
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
      p.usedCarTrade != null
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
}

export function clearTradeWriteFormSessionDraft(categoryId: string): void {
  if (typeof window === "undefined" || !categoryId.trim()) return;
  try {
    sessionStorage.removeItem(storageKey(categoryId.trim()));
  } catch {
    /* ignore */
  }
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
  };
}

export function draftImagesToUploadItems(urls: string[]): { url: string }[] {
  return urls.filter(isPersistableImageUrl).map((url) => ({ url }));
}

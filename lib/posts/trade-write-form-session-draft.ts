/**
 * 거래 물품 글쓰기(TradeWriteForm) 임시 저장 — 주소 관리 이동·뒤로 가기 시에만 복원 플래그와 함께 사용.
 * @see trade-write-address-return-flag.ts
 *
 * ## 카테고리별 스코프
 * - 키: `trade_category_id`(글쓰기에 선택한 거래 카테고리 UUID).
 * - 일반·부동산·중고차 스킨: 이 모듈(`TradeWriteForm`). 중고차 카테고리의 `icon_key` 가 `car` 인 경우도 스킨·초안 판정에서 `used-car` 와 동일 처리(`resolveTradeWriteSkinKey`). 일자리·환전: `jobs-exchange-write-meet-spot-staging.ts`.
 * - 같은 카테고리에서만 「이어쓰기」 복구. 다른 거래 카테고리로 바꾸면 `discardTradeWriteStashedDraft` 가 이 모듈 초안 + 일자리/환전 스테이징 + 복귀 플래그를 함께 정리한다.
 *
 * ## 저장되는 내용
 * - 텍스트·숫자·메타·거래 희망 장소 등은 그대로 세션+로컬에 저장.
 * - 이미지: 업로드된 https URL 은 `imageUrls`·`imageRefs[].url`, 업로드 전 File 은 기기 IndexedDB 에 보관하고
 *   `imageRefs[].localId` 로 순서와 함께 저장(`trade-write-draft-photo-store.ts`). 보관 못 한 blob 은 빠진다.
 *   `imageRefs` 가 없는 이전 초안은 `imageUrls` 로 읽는다.
 *
 * ## 새로 작성 vs 이어쓰기
 * - 「새로 작성」: 해당 카테고리 초안·복귀 플래그 삭제 + 재저장 억제 이벤트(`discardTradeWriteStashedDraft`).
 * - 「이어쓰기」: 저장된 초안을 폼에 적용(선택한 카테고리는 라우트·상위 상태 유지).
 */

import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";
import { isUsedCarTradeWriteSkin } from "@/lib/trade/resolve-trade-write-skin-key";
import { isPersistableStorageMediaRef } from "@/lib/media/persistable-storage-media-ref";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";

const STORAGE_VERSION = 1 as const;
/** 입력 중 초안 자동 저장 지연 — 일반 거래·일자리·환전 공통 */
export const TRADE_WRITE_DRAFT_AUTOSAVE_DEBOUNCE_MS = 400;
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
  images: { url: string; file?: File; localId?: string }[];
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
  /** 중고차 팝니다 — 선택 UI 복원용(없으면 car_model·mileage에서 매칭) */
  usedCarBrandKey?: string;
  usedCarModelKey?: string;
  usedCarMileagePresetKey?: string;
  /** 중고차 삽니다 — meta.car_body_type 키 복원 */
  usedCarBodyTypeKey?: string;
};

/** 초안 사진 1장 — 업로드된 주소 또는 기기 보관 id (대표 = 첫 장) */
export type TradeWriteDraftImageRef = { url: string } | { localId: string };

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
  /** 순서 포함 사진 목록(https + 기기 보관). 없으면 `imageUrls` */
  imageRefs?: TradeWriteDraftImageRef[];
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
  /** 중고차 팝니다 — 선택 UI 복원용(없으면 car_model·mileage에서 매칭) */
  usedCarBrandKey?: string;
  usedCarModelKey?: string;
  usedCarMileagePresetKey?: string;
  /** 중고차 삽니다 — meta.car_body_type 키 복원 */
  usedCarBodyTypeKey?: string;
  /**
   * P0-2 — 초안 작성자(user id). 쓰기 시점 기기 bound user 로 기록.
   * 읽기 시 현재 bound user 와 다르거나(다른 계정) 없으면(소유자 미상·비로그인) 무시한다.
   */
  ownerUserId?: string | null;
};

/** 현재 bound user 소유 초안만 허용 — 다른/미상 소유자 초안은 null */
function acceptDraftForCurrentOwner(
  d: TradeWriteFormSessionDraftV1
): TradeWriteFormSessionDraftV1 | null {
  const owner = getBoundAuthUserId();
  if (!owner) return null;
  const draftOwner = typeof d.ownerUserId === "string" ? d.ownerUserId.trim() : "";
  if (!draftOwner || draftOwner !== owner) return null;
  return d;
}

function stampDraftOwner(d: TradeWriteFormSessionDraftV1): TradeWriteFormSessionDraftV1 {
  return { ...d, ownerUserId: getBoundAuthUserId() };
}

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
    return acceptDraftForCurrentOwner(j as TradeWriteFormSessionDraftV1);
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
  return isPersistableStorageMediaRef(url) && /^https?:\/\//i.test(url.trim());
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
    images: readTradeWriteDraftImageRefs(d).map((r) => ({ url: "url" in r ? r.url : `local:${r.localId}` })),
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
    usedCarBrandKey: d.usedCarBrandKey ?? "",
    usedCarModelKey: d.usedCarModelKey ?? "",
    usedCarMileagePresetKey: d.usedCarMileagePresetKey ?? "",
    usedCarBodyTypeKey: d.usedCarBodyTypeKey ?? "",
  });
}

export function tradeWriteSessionDraftLooksFilled(p: TradeWriteFormSessionDraftBuildArgs): boolean {
  // region/city는 자동 채워지므로 사용자 입력으로 보지 않는다
  // 중고차: 마운트 시 기본 `usedCarTrade === "sell"` 만 있으면 빈 폼과 동일 — 나가기 스냅샷·차단 초안 오판 방지
  if (isUsedCarTradeWriteSkin(p.skinKey)) {
    return Boolean(
      p.title.trim() ||
        p.description.trim() ||
        p.price.trim() ||
        p.images.length > 0 ||
        p.tradeTopicChildId.trim() ||
        p.carModel.trim() ||
        p.carYear.trim() ||
        p.mileage.trim() ||
        p.carHasAccident ||
        (p.usedCarBrandKey ?? "").trim() ||
        (p.usedCarModelKey ?? "").trim() ||
        (p.usedCarMileagePresetKey ?? "").trim() ||
        (p.usedCarBodyTypeKey ?? "").trim() ||
        p.usedCarTrade === "buy" ||
        (p.tradeMeetSpot?.displayLine?.trim() ?? "").length > 0 ||
        p.descriptionAppend.trim()
    );
  }
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
    return acceptDraftForCurrentOwner(j as TradeWriteFormSessionDraftV1);
  } catch {
    return null;
  }
}

export function writeTradeWriteFormSessionDraft(draft: TradeWriteFormSessionDraftV1): void {
  if (typeof window === "undefined" || !draft.categoryId.trim()) return;
  const d = stampDraftOwner(draft);
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
  const { imageUrls, imageRefs } = tradeWriteImagesToDraftRefs(args.images);
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
    imageRefs,
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
    ...(isUsedCarTradeWriteSkin(args.skinKey) && args.usedCarTrade === "sell"
      ? {
          usedCarBrandKey: args.usedCarBrandKey ?? "",
          usedCarModelKey: args.usedCarModelKey ?? "",
          usedCarMileagePresetKey: args.usedCarMileagePresetKey ?? "",
        }
      : {}),
    ...(isUsedCarTradeWriteSkin(args.skinKey) && args.usedCarTrade === "buy"
      ? { usedCarBodyTypeKey: args.usedCarBodyTypeKey ?? "" }
      : {}),
  };
}

export function draftImagesToUploadItems(urls: string[]): { url: string }[] {
  return urls.filter(isPersistableImageUrl).map((url) => ({ url }));
}

/** 초안 사진 순서 목록 — `imageRefs` 우선, 이전 초안은 `imageUrls` */
export function readTradeWriteDraftImageRefs(d: TradeWriteFormSessionDraftV1): TradeWriteDraftImageRef[] {
  if (Array.isArray(d.imageRefs)) {
    const out: TradeWriteDraftImageRef[] = [];
    for (const r of d.imageRefs) {
      if (!r || typeof r !== "object") continue;
      if ("url" in r && typeof r.url === "string" && isPersistableImageUrl(r.url)) out.push({ url: r.url });
      else if ("localId" in r && typeof r.localId === "string" && r.localId.trim()) {
        out.push({ localId: r.localId.trim() });
      }
    }
    return out;
  }
  return draftImagesToUploadItems(d.imageUrls ?? []);
}

/** 초안이 참조하는 기기 보관 사진 id */
export function collectTradeWriteDraftLocalPhotoIds(d: TradeWriteFormSessionDraftV1 | null): string[] {
  if (!d) return [];
  return readTradeWriteDraftImageRefs(d).flatMap((r) => ("localId" in r ? [r.localId] : []));
}

/** 세션·로컬 초안 둘 다에서 참조하는 기기 보관 사진 id (정리 시 보존 대상) */
export function collectTradeWriteStoredDraftLocalPhotoIds(categoryId: string): string[] {
  return [
    ...collectTradeWriteDraftLocalPhotoIds(readTradeWriteFormSessionDraft(categoryId)),
    ...collectTradeWriteDraftLocalPhotoIds(readTradeWriteFormLocalDraft(categoryId)),
  ];
}

/** 저장될 초안 기준 「작성 중」 — 보관 못 한 사진만 있으면 빈 초안을 만들지 않는다 */
export function tradeWriteBuiltDraftLooksFilled(args: TradeWriteFormSessionDraftBuildArgs): boolean {
  return tradeWritePersistedDraftLooksFilled(buildTradeWriteFormSessionDraft(args));
}

/**
 * 화면 사진 목록 → 저장용. https 는 `{url}`, 기기 보관 사진은 `{localId}`, 둘 다 아닌 blob 은 뺀다.
 * `imageUrls` 는 https 만 (이전 저장본·이전 코드 호환).
 */
export function tradeWriteImagesToDraftRefs(images: ReadonlyArray<{ url: string; localId?: string }>): {
  imageUrls: string[];
  imageRefs: TradeWriteDraftImageRef[];
} {
  const imageUrls: string[] = [];
  const imageRefs: TradeWriteDraftImageRef[] = [];
  for (const x of images) {
    if (isPersistableImageUrl(x.url)) {
      imageUrls.push(x.url);
      imageRefs.push({ url: x.url });
    } else if (x.localId?.trim()) {
      imageRefs.push({ localId: x.localId.trim() });
    }
  }
  return { imageUrls, imageRefs };
}

/** 저장본 사진 목록 정규화 — `imageRefs` 가 있으면 그것, 없으면 `imageUrls` (일자리·환전 스테이징 공용) */
export function readDraftImageRefsFromFields(fields: {
  imageRefs?: unknown;
  imageUrls?: string[];
}): TradeWriteDraftImageRef[] {
  return readTradeWriteDraftImageRefs(fields as TradeWriteFormSessionDraftV1);
}

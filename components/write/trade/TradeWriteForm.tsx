"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  USED_CAR_FORM_YEAR_MIN,
  getUsedCarFormYearMax,
  findMileagePresetKeyForDigits,
  resolveUsedCarSellKeysFromStoredCarModel,
  labelForUsedCarBodyTypeKey,
} from "@/lib/trade/used-car-form-catalog";
import { isUsedCarTradeWriteSkin, resolveTradeWriteSkinKey } from "@/lib/trade/resolve-trade-write-skin-key";
import { UsedCarSellFields } from "./UsedCarSellFields";
import { UsedCarBuyFields } from "./UsedCarBuyFields";
import {
  GenericTradeWriteFields,
  validateAdaptedCompositionValues,
} from "./generic/GenericTradeWriteFields";
import { resolveTradeCompositionForCategory } from "@/lib/trade/category-form/resolve-for-category";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import type { TradeFieldValueBag } from "@/lib/trade/category-form/field-value-bridge";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveWriteCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";

type TradeWriteTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 중고차(차량) 연식 — DB·표시 모두 4자리 연도 */
function getUsedCarYearFieldError(
  raw: string,
  mode: "buy" | "sell",
  t: TradeWriteTranslate
): string | null {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) {
    return mode === "buy" ? t("trade_write_err_year_buy") : t("trade_write_err_year_sell");
  }
  if (digits.length < 4) {
    return t("trade_write_err_year_digits");
  }
  const y = parseInt(digits, 10);
  const max = getUsedCarFormYearMax();
  if (y < USED_CAR_FORM_YEAR_MIN || y > max) {
    return t("trade_write_err_year_range", { min: USED_CAR_FORM_YEAR_MIN, max });
  }
  return null;
}

function buildTradeMeta(
  skinKey: string,
  v: {
    neighborhood: string;
    buildingName: string;
    estateType: string;
    dealType: string;
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
    carTrade: "buy" | "sell" | null;
    usedCarBodyTypeKey: string;
    carHasAccident: boolean;
    transmission: string;
    fuelType: string;
    salary: string;
    workPlace: string;
    workType: string;
    currency: string;
    exchangeRate: string;
  }
): Record<string, unknown> {
  if (skinKey === "real-estate") {
    const o: Record<string, unknown> = {};
    if (v.neighborhood.trim()) o.neighborhood = v.neighborhood.trim();
    if (v.buildingName.trim()) o.building_name = v.buildingName.trim();
    if (v.estateType.trim()) o.estate_type = v.estateType.trim();
    if (v.dealType.trim()) o.deal_type = v.dealType.trim();
    if (v.deposit.trim()) o.deposit = v.deposit.trim();
    if (v.monthly.trim()) o.monthly = v.monthly.trim();
    if (v.managementFee.trim()) o.management_fee = v.managementFee.trim();
    if (v.hasPremium) o.has_premium = true;
    if (v.areaSqm.trim()) o.size_sq = v.areaSqm.trim();
    if (v.roomCount.trim()) o.room_count = v.roomCount.trim();
    if (v.bathroomCount.trim()) o.bathroom_count = v.bathroomCount.trim();
    if (v.moveInDate.trim()) o.move_in_date = v.moveInDate.trim();
    return o;
  }
  if (skinKey === "used-car") {
    const o: Record<string, unknown> = {};
    if (v.carTrade === "buy" || v.carTrade === "sell") o.car_trade = v.carTrade;
    if (v.carTrade === "buy" && v.usedCarBodyTypeKey.trim()) o.car_body_type = v.usedCarBodyTypeKey.trim();
    if (v.carModel.trim()) o.car_model = v.carModel.trim();
      if (v.carTrade === "sell") {
      if (v.carYear.trim()) o.car_year = v.carYear.replace(/\D/g, "").slice(0, 4);
      const mileageDigits = v.mileage.replace(/,/g, "").replace(/\D/g, "");
      if (mileageDigits) o.mileage = mileageDigits;
      o.has_accident = v.carHasAccident === true;
      if (v.transmission.trim()) o.transmission = v.transmission.trim();
      if (v.fuelType.trim()) o.fuel_type = v.fuelType.trim();
    }
    if (v.carTrade === "buy" && v.carYear.trim()) {
      o.car_year_max = v.carYear.replace(/\D/g, "").slice(0, 4);
    }
    return o;
  }
  if (skinKey === "jobs") {
    const o: Record<string, unknown> = {};
    if (v.salary.trim()) o.salary = v.salary.trim();
    if (v.workPlace.trim()) o.work_place = v.workPlace.trim();
    if (v.workType.trim()) o.work_type = v.workType.trim();
    return o;
  }
  if (skinKey === "exchange") {
    const o: Record<string, unknown> = {};
    if (v.currency.trim()) o.currency = v.currency.trim();
    if (v.exchangeRate.trim()) o.exchange_rate = v.exchangeRate.trim();
    return o;
  }
  return {};
}
import { createPost } from "@/lib/posts/createPost";
import { updateTradePostFromCreatePayload } from "@/lib/posts/updateTradePost";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { hydrateTradeWriteFormFromSnapshot } from "@/lib/posts/apply-owner-snapshot-to-trade-write-form";
import { normalizeTradeChatCallPolicy, type TradeChatCallPolicy } from "@/lib/trade/trade-chat-call-policy";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  ensureClientAccessOrRedirectAsync,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel, formatPriceInput } from "@/lib/utils/format";
import { REGIONS, getLocationLabel } from "@/lib/products/form-options";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "../useWriteScreenEmbeddedTier1";
import { AutoGrowTextarea } from "../shared/AutoGrowTextarea";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { TradeFrequentPhrasesSheet } from "../shared/TradeFrequentPhrasesSheet";
import {
  TradeDefaultLocationBlock,
  type TradeWriteAddressSsotSnapshot,
} from "../shared/TradeDefaultLocationBlock";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";
import { consumeTradeWriteRestoreAfterAddressFlag, setTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import {
  clearTradeMeetSpotPickResult,
  clearTradeMeetSpotSessionNavigationState,
  consumeTradeMeetSpotPickResult,
  peekTradeMeetSpotPickResult,
  prepareTradeMeetSpotMapNavigation,
} from "@/lib/posts/trade-meet-spot-pick-storage";
import {
  tradeMeetSpotFromClientFields,
  tradeMeetSpotFromMetaSnapshot,
  buildTradeMeetSpotMetaForPersist,
  type TradeMeetSpotValue,
} from "@/lib/posts/trade-meet-spot-types";
import { inferTradeRegionCityFromMeetSpot } from "@/lib/posts/infer-trade-region-from-meet-spot";
import { PHILIFE_FB_TEXTAREA_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import {
  buildTradeWriteFormSessionDraft,
  clearTradeWriteFormSessionDraft,
  draftImagesToUploadItems,
  readTradeWriteFormPersistedDraft,
  tradeWriteSessionDraftLooksFilled,
  writeTradeWriteFormSessionDraft,
  type TradeWriteFormSessionDraftBuildArgs,
  type TradeWriteFormSessionDraftV1,
} from "@/lib/posts/trade-write-form-session-draft";
import {
  clearTradeWriteMeetSpotStaging,
  peekTradeWriteMeetSpotStaging,
  persistTradeWriteMeetSpotStaging,
  stripTradeWriteMeetSpotSessionMirror,
} from "@/lib/posts/trade-write-meet-spot-staging";
import { MobileDualActionBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import {
  TRADE_WRITE_DRAFT_DISCARDED_EVENT,
  discardTradeWriteStashedDraft,
  type TradeWriteDraftDiscardedDetail,
} from "@/lib/posts/trade-write-exit-cleanup";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import { APP_TRADE_WRITE_FORM_FB_STACK_CLASS } from "@/lib/ui/app-content-layout";
import {
  TRADE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_BLOCK_TITLE,
  TRADE_WRITE_FB_CONTROL,
  TRADE_WRITE_FB_CONTROL_ROW,
  TRADE_WRITE_FB_FIELD_HEAD,
  TRADE_WRITE_FB_FIELD_LABEL,
} from "@/lib/ui/trade-write-fb-ui";
import { KARROT_PILL_ACTIVE, KARROT_PILL_IDLE } from "./trade-karrot-classes";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import {
  hrefTradeMeetSpotPick,
  peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
  resolveTradeMeetSpotReturnTo,
  scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
} from "@/lib/navigation/trade-meet-spot-return-to";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import {
  TRADE_MEET_SPOT_SCROLL_ANCHOR_ID,
  consumeTradeMeetSpotFocusOnReturn,
  markTradeMeetSpotFocusOnReturn,
  persistTradeMeetSpotReturnScrollPosition,
  restoreTradeMeetSpotReturnScrollPosition,
  scrollTradeMeetSpotAnchorIntoView,
} from "@/lib/posts/trade-meet-spot-anchor-scroll";

interface TradeWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  /** 거래 시트·폼 취소 확인용 — 의미 있는 초안 여부(복원 대기 포함) */
  onMeaningfulTradeDraftChange?: (has: boolean) => void;
  /** `/write?category=` 단일 화면 — 상위에서 1단·카테고리를 쓸 때 폼 내부 1단 숨김 */
  suppressTier1Chrome?: boolean;
  /** `/products/[id]/edit` — 기존 글 수정 */
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
  /** GET owner-edit `tradePolicy` */
  tradePolicy?: TradePolicyClient | null;
}

export function TradeWriteForm({
  category,
  onSuccess,
  onCancel,
  onMeaningfulTradeDraftChange,
  suppressTier1Chrome = false,
  editPostId,
  ownerEditSnapshot,
  tradePolicy = null,
}: TradeWriteFormProps) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const tradeWriteSheetEpoch = tradeWriteSheet?.openEpoch ?? 0;
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const categoryLabel = useMemo(
    () => resolveWriteCategoryUILabel(language, category),
    [language, category]
  );
  const appSettings = useMemo(() => getAppSettings(), []);
  const currencyUnit = getCurrencyUnitLabel(appSettings.defaultCurrency);
  const settings = category.settings;
  const hasPrice = settings?.has_price ?? true;
  const hasDirectDeal = settings?.has_direct_deal ?? true;
  const hasFreeShare = settings?.has_free_share ?? true;
  const maxProductImages = Math.max(1, appSettings.maxProductImages ?? 10);
  const allowPriceOffer = appSettings.allowPriceOffer ?? true;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isPriceOfferEnabled, setIsPriceOfferEnabled] = useState(false);
  const [isFreeShare, setIsFreeShare] = useState(false);
  /** 신규 글: 직거래 기본 — 나눔 선택 시 false 로 전환 */
  const [isDirectDeal, setIsDirectDeal] = useState(true);
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  /** 당근형 — 자주 쓰는 문구 바텀시트 */
  const [frequentPhrasesOpen, setFrequentPhrasesOpen] = useState(false);
  const [descriptionAppend, setDescriptionAppend] = useState("");
  /** 거래 채팅 통화(메신저) — 판매자만 설정, 구매자에게 음성/영상 버튼 노출 */
  const [tradeChatCallPolicy, setTradeChatCallPolicy] = useState<TradeChatCallPolicy>("none");
  /** 당근형 일반 중고 — 거래 희망 장소(지도 선택, 주소록과 별도) */
  const [tradeMeetSpot, setTradeMeetSpot] = useState<TradeMeetSpotValue | null>(null);
  const [tradeAddressSsot, setTradeAddressSsot] = useState<TradeWriteAddressSsotSnapshot>({
    ready: false,
    missing: true,
    displayLine: null,
    regionId: "",
    cityId: "",
    tradeLguId: null,
    nationalStatus: "pending",
  });
  const coreLocked = Boolean(editPostId && tradePolicy && !tradePolicy.allowEditCore);
  const locationLocked = Boolean(
    editPostId && tradePolicy && tradePolicy.allowEditTradeLocation === false,
  );
  const showDescriptionAppend = Boolean(editPostId && tradePolicy?.allowAppendOnlyDescription);
  const skinKey = resolveTradeWriteSkinKey(category.icon_key);
  const isUsedCarSkin = skinKey === "used-car";
  /**
   * 중고차는 환전 폼과 같이 DB `has_location=false` 여도 거래 희망 장소·지도 플로우를 일반 중고와 동일하게 둔다.
   * (카테고리별 플래그만으로 블록이 숨겨지면 초안·픽 복귀가 동작하지 않음)
   */
  const hasLocation = isUsedCarSkin ? true : (settings?.has_location ?? true);
  /** 일반 제목 행·판매/나눔 당근형 — 부동산·중고차는 전용 상단 필드 */
  const isKarrotGeneral = skinKey !== "real-estate" && skinKey !== "used-car";

  // 거래 종류별 meta 필드
  const [neighborhood, setNeighborhood] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [estateType, setEstateType] = useState("");
  const [dealType, setDealType] = useState<"임대" | "판매">("임대");
  const [deposit, setDeposit] = useState("");
  const [monthly, setMonthly] = useState("");
  const [managementFee, setManagementFee] = useState("");
  const [hasPremium, setHasPremium] = useState(false);
  const [areaSqm, setAreaSqm] = useState("");
  const [roomCount, setRoomCount] = useState("");
  const [bathroomCount, setBathroomCount] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [mileage, setMileage] = useState("");
  /** 중고차: 삽니다(buy) / 팝니다(sell) — 신규 작성 기본은 팝니다 */
  const [usedCarTrade, setUsedCarTrade] = useState<"buy" | "sell" | null>(() =>
    isUsedCarTradeWriteSkin(category.icon_key) ? "sell" : null
  );
  const [usedCarBrandKey, setUsedCarBrandKey] = useState("");
  const [usedCarModelKey, setUsedCarModelKey] = useState("");
  const [usedCarMileagePresetKey, setUsedCarMileagePresetKey] = useState("");
  /** 삽니다 — meta.car_body_type 키 */
  const [usedCarBodyTypeKey, setUsedCarBodyTypeKey] = useState("");
  const prevUsedCarTradeRef = useRef<"buy" | "sell" | null>(usedCarTrade);
  /** 팝니다: 사고 이력 있음 */
  const [carHasAccident, setCarHasAccident] = useState(false);
  const [transmission, setTransmission] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [salary, setSalary] = useState("");
  const [workPlace, setWorkPlace] = useState("");
  const [workType, setWorkType] = useState("");
  const [currency, setCurrency] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [tradeTopicChildId, setTradeTopicChildId] = useState("");

  const tradeComposition = useMemo(
    () => resolveTradeCompositionForCategory(category),
    [category]
  );
  const realEstateAdaptedFields = useMemo(() => {
    if (skinKey !== "real-estate") return [];
    return applyTradeBehaviorAdapter(tradeComposition, { dealType });
  }, [skinKey, tradeComposition, dealType]);
  const usedCarAdaptedFields = useMemo(() => {
    if (skinKey !== "used-car") return [];
    return applyTradeBehaviorAdapter(tradeComposition, { carTrade: usedCarTrade });
  }, [skinKey, tradeComposition, usedCarTrade]);
  const generalAdaptedFields = useMemo(() => {
    if (skinKey === "real-estate" || skinKey === "used-car") return [];
    return applyTradeBehaviorAdapter(tradeComposition, {});
  }, [skinKey, tradeComposition]);
  const realEstateFieldValues = useMemo((): TradeFieldValueBag => {
    if (skinKey !== "real-estate") return {};
    return {
      deal_type: dealType,
      estate_type: estateType,
      price,
      deposit,
      monthly,
      management_fee: managementFee,
      has_premium: hasPremium,
      floor_area: areaSqm,
      bedrooms: roomCount,
      bathrooms: bathroomCount,
      move_in_date: moveInDate,
      neighborhood,
      building_name: buildingName,
    };
  }, [
    skinKey,
    dealType,
    estateType,
    price,
    deposit,
    monthly,
    managementFee,
    hasPremium,
    areaSqm,
    roomCount,
    bathroomCount,
    moveInDate,
    neighborhood,
    buildingName,
  ]);
  const usedCarFieldValues = useMemo((): TradeFieldValueBag => {
    if (skinKey !== "used-car") return {};
    return {
      car_trade: usedCarTrade ?? "",
      make: carModel,
      model: carModel,
      year: carYear,
      mileage,
      body_type: usedCarBodyTypeKey,
      has_accident: carHasAccident,
      transmission,
      fuel_type: fuelType,
      price,
      title,
      description,
    };
  }, [
    skinKey,
    usedCarTrade,
    carModel,
    carYear,
    mileage,
    usedCarBodyTypeKey,
    carHasAccident,
    transmission,
    fuelType,
    price,
    title,
    description,
  ]);
  const generalFieldValues = useMemo((): TradeFieldValueBag => {
    if (skinKey === "real-estate" || skinKey === "used-car") return {};
    return {
      title,
      price,
      description,
      is_free_share: isFreeShare,
      is_price_offer: isPriceOfferEnabled,
    };
  }, [skinKey, title, price, description, isFreeShare, isPriceOfferEnabled]);
  const onRealEstateCompositionChange = useCallback((fieldId: string, value: string | boolean) => {
    switch (fieldId) {
      case "deal_type":
        setDealType(value === "판매" ? "판매" : "임대");
        break;
      case "estate_type":
        setEstateType(String(value));
        break;
      case "price":
        setPrice(String(value));
        break;
      case "deposit":
        setDeposit(String(value));
        break;
      case "monthly":
        setMonthly(String(value));
        break;
      case "management_fee":
        setManagementFee(String(value));
        break;
      case "has_premium":
        setHasPremium(value === true);
        break;
      case "floor_area":
        setAreaSqm(String(value));
        break;
      case "bedrooms":
        setRoomCount(String(value).replace(/[^0-9]/g, ""));
        break;
      case "bathrooms":
        setBathroomCount(String(value).replace(/[^0-9]/g, ""));
        break;
      case "move_in_date":
        setMoveInDate(String(value));
        break;
      case "neighborhood":
        setNeighborhood(String(value));
        break;
      case "building_name":
        setBuildingName(String(value));
        break;
      default:
        break;
    }
  }, []);

  const prevWriteCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevWriteCategoryIdRef.current;
    prevWriteCategoryIdRef.current = category.id;
    if (prev === null) return;
    if (prev === category.id) return;
    setTradeTopicChildId("");
    if (!editPostId) setTradeChatCallPolicy("none");
  }, [category.id, editPostId]);

  const effectiveTradeRegionId = useMemo(() => {
    return region.trim();
  }, [region]);

  const effectiveTradeCityId = useMemo(() => {
    return city.trim();
  }, [city]);

  /** 신규 작성: 카테고리 바뀔 때마다 직거래·나눔 기본값(직거래 우선) — 수정 모드는 스냅샷이 덮어씀 */
  useEffect(() => {
    if (editPostId) return;
    if (isUsedCarSkin) return;
    setIsFreeShare(false);
    setIsDirectDeal(true);
  }, [category.id, editPostId, isUsedCarSkin]);

  /** 중고차로 들어올 때(또는 카테고리 전환) 미선택이면 팝니다 기본 */
  useEffect(() => {
    if (editPostId) return;
    if (!isUsedCarSkin) return;
    setUsedCarTrade((prev) => (prev === null ? "sell" : prev));
  }, [category.id, editPostId, isUsedCarSkin]);

  /** 카테고리 설정상 한쪽만 허용일 때 상태 정합 */
  useEffect(() => {
    if (isUsedCarSkin) return;
    if (!hasFreeShare && hasDirectDeal) {
      setIsFreeShare(false);
      setIsDirectDeal(true);
    } else if (hasFreeShare && !hasDirectDeal) {
      setIsFreeShare(true);
      setIsDirectDeal(false);
    }
  }, [hasFreeShare, hasDirectDeal, isUsedCarSkin]);

  useEffect(() => {
    if (!isUsedCarSkin) return;
    const prev = prevUsedCarTradeRef.current;
    prevUsedCarTradeRef.current = usedCarTrade;
    if (usedCarTrade !== "sell") return;
    if (prev === "sell") return;
    const r = resolveUsedCarSellKeysFromStoredCarModel(carModel);
    setUsedCarBrandKey(r.brandKey);
    setUsedCarModelKey(r.modelKey);
    const md = mileage.replace(/\D/g, "");
    setUsedCarMileagePresetKey(md ? findMileagePresetKeyForDigits(md) : "");
  }, [isUsedCarSkin, usedCarTrade, carModel, mileage]);

  useEffect(() => {
    if (!isUsedCarSkin) return;
    if (usedCarTrade !== "buy") setUsedCarBodyTypeKey("");
  }, [isUsedCarSkin, usedCarTrade]);

  useEffect(() => {
    if (isUsedCarSkin) return;
    setUsedCarBrandKey("");
    setUsedCarModelKey("");
    setUsedCarMileagePresetKey("");
  }, [isUsedCarSkin]);

  const syncTradeRegionCity = useCallback((rid: string, cid: string) => {
    setRegion(rid);
    setCity(cid);
  }, []);

  const applyMeetSpotPick = useCallback((next: TradeMeetSpotValue) => {
    setTradeMeetSpot(next);
    const loc = inferTradeRegionCityFromMeetSpot(next);
    if (loc) syncTradeRegionCity(loc.regionId, loc.cityId);
  }, [syncTradeRegionCity]);

  const tradeDraftFlushRef = useRef<TradeWriteFormSessionDraftBuildArgs | null>(null);
  /** 확인 나가기·카테고리 이탈 등으로 저장소를 비운 뒤, 언마운트·디바운스 전에 재저장 방지 */
  const suppressDraftPersistenceRef = useRef(false);
  /** 글 등록·수정 성공 직후 — 폼 state는 아직 남아도 상위 blockingDraft 를 즉시 내림 */
  const [tradeWriteSucceededClearBlocking, setTradeWriteSucceededClearBlocking] = useState(false);

  const [draftResumeGate, setDraftResumeGate] = useState<"pending_choice" | "ready">("ready");
  const [resumeDraftSnapshot, setResumeDraftSnapshot] = useState<TradeWriteFormSessionDraftV1 | null>(null);

  const applyPersistedDraft = useCallback((d: TradeWriteFormSessionDraftV1) => {
    setTitle(d.title ?? "");
    setDescription(d.description ?? "");
    setPrice(d.price ?? "");
    setRegion(d.region ?? "");
    setCity(d.city ?? "");
    setImages(
      isUsedCarTradeWriteSkin(d.skinKey) && d.usedCarTrade === "buy"
        ? []
        : draftImagesToUploadItems(d.imageUrls ?? [])
    );
    setIsFreeShare(d.isFreeShare === true);
    setIsPriceOfferEnabled(d.isPriceOfferEnabled === true);
    setIsDirectDeal(d.isDirectDeal !== false);
    setTradeTopicChildId(d.tradeTopicChildId ?? "");
    setNeighborhood(d.neighborhood ?? "");
    setBuildingName(d.buildingName ?? "");
    setEstateType(d.estateType ?? "");
    setDealType(d.dealType === "판매" ? "판매" : "임대");
    setDeposit(d.deposit ?? "");
    setMonthly(d.monthly ?? "");
    setManagementFee(d.managementFee ?? "");
    setHasPremium(d.hasPremium === true);
    setAreaSqm(d.areaSqm ?? "");
    setRoomCount(d.roomCount ?? "");
    setBathroomCount(d.bathroomCount ?? "");
    setMoveInDate(d.moveInDate ?? "");
    setCarModel(d.carModel ?? "");
    setCarYear(d.carYear ?? "");
    setMileage(d.mileage ?? "");
    const draftUsedCarSell = isUsedCarTradeWriteSkin(d.skinKey) && d.usedCarTrade === "sell";
    const draftUsedCarBuy = isUsedCarTradeWriteSkin(d.skinKey) && d.usedCarTrade === "buy";
    if (draftUsedCarSell) {
      setUsedCarBodyTypeKey("");
      if ((d.usedCarBrandKey ?? "").trim()) {
        setUsedCarBrandKey(d.usedCarBrandKey!.trim());
        setUsedCarModelKey((d.usedCarModelKey ?? "").trim());
      } else {
        const r = resolveUsedCarSellKeysFromStoredCarModel(d.carModel ?? "");
        setUsedCarBrandKey(r.brandKey);
        setUsedCarModelKey(r.modelKey);
      }
      if ((d.usedCarMileagePresetKey ?? "").trim()) {
        setUsedCarMileagePresetKey(d.usedCarMileagePresetKey!.trim());
      } else {
        const md = (d.mileage ?? "").replace(/\D/g, "");
        setUsedCarMileagePresetKey(md ? findMileagePresetKeyForDigits(md) : "");
      }
    } else if (draftUsedCarBuy) {
      setUsedCarBrandKey("");
      setUsedCarModelKey("");
      setUsedCarMileagePresetKey("");
      setUsedCarBodyTypeKey((d.usedCarBodyTypeKey ?? "").trim());
    } else {
      setUsedCarBrandKey("");
      setUsedCarModelKey("");
      setUsedCarMileagePresetKey("");
      setUsedCarBodyTypeKey("");
    }
    setUsedCarTrade(d.usedCarTrade === "buy" || d.usedCarTrade === "sell" ? d.usedCarTrade : null);
    setCarHasAccident(d.carHasAccident === true);
    setSalary(d.salary ?? "");
    setWorkPlace(d.workPlace ?? "");
    setWorkType(d.workType ?? "");
    setCurrency(d.currency ?? "");
    setExchangeRate(d.exchangeRate ?? "");
    setTradeChatCallPolicy(normalizeTradeChatCallPolicy(d.tradeChatCallPolicy));
    setDescriptionAppend(d.descriptionAppend ?? "");
    setTradeMeetSpot(tradeMeetSpotFromClientFields(d.tradeMeetSpot));
  }, []);

  /** 주소 관리·지도 복귀 시 즉시 복원 · 진짜 이탈 초안만 이어쓰기 확인 */
  useLayoutEffect(() => {
    if (editPostId) return;
    const skipDraftPrompt = peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
    const shouldRestore = consumeTradeWriteRestoreAfterAddressFlag(category.id);
    const hasMeetSpotReturn = peekTradeMeetSpotPickResult() != null;
    if (skipDraftPrompt || shouldRestore || hasMeetSpotReturn) {
      const staged = peekTradeWriteMeetSpotStaging(category.id);
      if (staged) {
        applyPersistedDraft(staged);
        stripTradeWriteMeetSpotSessionMirror(category.id);
      } else {
        const d = readTradeWriteFormPersistedDraft(category.id);
        if (d) applyPersistedDraft(d);
      }
      setResumeDraftSnapshot(null);
      setDraftResumeGate("ready");
      if (skipDraftPrompt) {
        scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
      }
      return;
    }
    const d = readTradeWriteFormPersistedDraft(category.id);
    if (!d) {
      setResumeDraftSnapshot(null);
      setDraftResumeGate("ready");
      return;
    }
    /** 세션·로컬에 남아 있으면 무조건 이어쓰기 선택지 — 마운트 시 지우지 않음(나가기 유지·카테고리 재선택 흐름과 동일) */
    setResumeDraftSnapshot(d);
    setDraftResumeGate("pending_choice");
  }, [editPostId, category.id, applyPersistedDraft, pathname, tradeWriteSheetEpoch]);

  useEffect(() => {
    suppressDraftPersistenceRef.current = false;
    setTradeWriteSucceededClearBlocking(false);
  }, [category.id]);

  const assembleTradeWriteFlushPayload = useCallback(
    (workingImages: ImageUploadItem[]): TradeWriteFormSessionDraftBuildArgs => ({
      categoryId: category.id,
      skinKey,
      title,
      description,
      price,
      region,
      city,
      images: workingImages,
      isFreeShare,
      isPriceOfferEnabled,
      isDirectDeal,
      tradeTopicChildId,
      neighborhood,
      buildingName,
      estateType,
      dealType,
      deposit,
      monthly,
      managementFee,
      hasPremium,
      areaSqm,
      roomCount,
      bathroomCount,
      moveInDate,
      carModel,
      carYear,
      mileage,
      usedCarTrade,
      carHasAccident,
      salary,
      workPlace,
      workType,
      currency,
      exchangeRate,
      tradeChatCallPolicy,
      descriptionAppend,
      tradeMeetSpot,
      usedCarBrandKey,
      usedCarModelKey,
      usedCarMileagePresetKey,
      usedCarBodyTypeKey,
    }),
    [
      category.id,
      skinKey,
      title,
      description,
      price,
      region,
      city,
      isFreeShare,
      isPriceOfferEnabled,
      isDirectDeal,
      tradeTopicChildId,
      neighborhood,
      buildingName,
      estateType,
      dealType,
      deposit,
      monthly,
      managementFee,
      hasPremium,
      areaSqm,
      roomCount,
      bathroomCount,
      moveInDate,
      carModel,
      carYear,
      mileage,
      usedCarTrade,
      carHasAccident,
      salary,
      workPlace,
      workType,
      currency,
      exchangeRate,
      tradeChatCallPolicy,
      descriptionAppend,
      tradeMeetSpot,
      usedCarBrandKey,
      usedCarModelKey,
      usedCarMileagePresetKey,
      usedCarBodyTypeKey,
    ]
  );

  /** 미업로드 사진을 스토리지에 올린 뒤 URL 목록으로 맞춘다 — 초안·나가기 스냅샷 공통 */
  const uploadPendingTradeWriteImages = useCallback(async (): Promise<ImageUploadItem[]> => {
    const user = getCurrentUser();
    let workingImages = [...images];
    const files = workingImages.map((x) => x.file).filter((f): f is File => !!f);
    if (files.length === 0) return workingImages;
    if (!user?.id) {
      await dibayAlert({ title: t("trade_056") });
      throw new Error("no-user");
    }
    const uploaded = await uploadPostImages(files, user.id);
    if (uploaded.length !== files.length) {
      await dibayAlert({
        title: t("trade_write_err_upload_partial", { total: files.length, uploaded: uploaded.length }),
      });
      throw new Error("partial-upload");
    }
    let idx = 0;
    workingImages = workingImages.map((item) => {
      if (item.file) {
        const url = uploaded[idx++];
        return url ? { url } : item;
      }
      return item;
    });
    setImages(workingImages);
    return workingImages;
  }, [images]);

  const meaningfulTradeDraftForSheet = useMemo(() => {
    if (editPostId) return false;
    if (tradeWriteSucceededClearBlocking) return false;
    if (draftResumeGate === "pending_choice") return true;
    const flushPayload = assembleTradeWriteFlushPayload(images);
    return tradeWriteSessionDraftLooksFilled(flushPayload);
  }, [
    editPostId,
    draftResumeGate,
    category.id,
    skinKey,
    title,
    description,
    price,
    region,
    city,
    images,
    isFreeShare,
    isPriceOfferEnabled,
    isDirectDeal,
    tradeTopicChildId,
    neighborhood,
    buildingName,
    estateType,
    dealType,
    deposit,
    monthly,
    managementFee,
    hasPremium,
    areaSqm,
    roomCount,
    bathroomCount,
    moveInDate,
    carModel,
    carYear,
    mileage,
    usedCarTrade,
    usedCarBodyTypeKey,
    carHasAccident,
    salary,
    workPlace,
    workType,
    currency,
    exchangeRate,
    tradeChatCallPolicy,
    descriptionAppend,
    tradeMeetSpot,
    usedCarBrandKey,
    usedCarModelKey,
    usedCarMileagePresetKey,
    tradeWriteSucceededClearBlocking,
    assembleTradeWriteFlushPayload,
  ]);

  useEffect(() => {
    if (!onMeaningfulTradeDraftChange) return;
    onMeaningfulTradeDraftChange(meaningfulTradeDraftForSheet);
    return () => onMeaningfulTradeDraftChange(false);
  }, [meaningfulTradeDraftForSheet, onMeaningfulTradeDraftChange]);

  const handleResumePersistedDraft = useCallback(() => {
    if (!resumeDraftSnapshot) return;
    applyPersistedDraft(resumeDraftSnapshot);
    setResumeDraftSnapshot(null);
    setDraftResumeGate("ready");
  }, [resumeDraftSnapshot, applyPersistedDraft]);

  const sessionDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 「새로 작성」— 저장소 비운 뒤 폼도 비움. 스토리지만 비우면 나가기 스냅샷이 메모리의 이미지·글로 초안을 다시 씀.
   */
  const handleDiscardPersistedDraft = useCallback(() => {
    if (editPostId) return;
    discardTradeWriteStashedDraft(category.id);
    tradeDraftFlushRef.current = null;
    suppressDraftPersistenceRef.current = false;

    setResumeDraftSnapshot(null);
    setDraftResumeGate("ready");

    setTitle("");
    setDescription("");
    setPrice("");
    setImages([]);
    setErrors({});
    setDescriptionAppend("");
    setTradeChatCallPolicy("none");
    setTradeMeetSpot(null);
    setTradeTopicChildId("");
    setNeighborhood("");
    setBuildingName("");
    setEstateType("");
    setDealType("임대");
    setDeposit("");
    setMonthly("");
    setManagementFee("");
    setHasPremium(false);
    setAreaSqm("");
    setRoomCount("");
    setBathroomCount("");
    setMoveInDate("");
    setCarModel("");
    setCarYear("");
    setMileage("");
    setUsedCarBrandKey("");
    setUsedCarModelKey("");
    setUsedCarMileagePresetKey("");
    setUsedCarBodyTypeKey("");
    setUsedCarTrade(isUsedCarSkin ? "sell" : null);
    setCarHasAccident(false);
    setTransmission("");
    setFuelType("");
    setSalary("");
    setWorkPlace("");
    setWorkType("");
    setCurrency("");
    setExchangeRate("");
    setIsPriceOfferEnabled(false);
    setRegion("");
    setCity("");
    if (!isUsedCarSkin) {
      if (!hasFreeShare && hasDirectDeal) {
        setIsFreeShare(false);
        setIsDirectDeal(true);
      } else if (hasFreeShare && !hasDirectDeal) {
        setIsFreeShare(true);
        setIsDirectDeal(false);
      } else {
        setIsFreeShare(false);
        setIsDirectDeal(true);
      }
    }
  }, [category.id, editPostId, hasDirectDeal, hasFreeShare, isUsedCarSkin]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TradeWriteDraftDiscardedDetail>).detail;
      if (!detail?.categoryId || detail.categoryId !== category.id) return;
      suppressDraftPersistenceRef.current = true;
      tradeDraftFlushRef.current = null;
      if (sessionDraftTimerRef.current) {
        clearTimeout(sessionDraftTimerRef.current);
        sessionDraftTimerRef.current = null;
      }
    };
    window.addEventListener(TRADE_WRITE_DRAFT_DISCARDED_EVENT, handler as EventListener);
    return () => window.removeEventListener(TRADE_WRITE_DRAFT_DISCARDED_EVENT, handler as EventListener);
  }, [category.id]);

  useEffect(() => {
    if (editPostId) {
      tradeDraftFlushRef.current = null;
      return;
    }
    if (suppressDraftPersistenceRef.current) {
      tradeDraftFlushRef.current = null;
      return;
    }
    if (draftResumeGate === "pending_choice") {
      tradeDraftFlushRef.current = null;
      return;
    }
    if (tradeWriteSucceededClearBlocking) {
      tradeDraftFlushRef.current = null;
      return;
    }
    const flushPayload = assembleTradeWriteFlushPayload(images);
    tradeDraftFlushRef.current = flushPayload;
    if (!tradeWriteSessionDraftLooksFilled(flushPayload)) return;
    if (sessionDraftTimerRef.current) clearTimeout(sessionDraftTimerRef.current);
    sessionDraftTimerRef.current = setTimeout(() => {
      sessionDraftTimerRef.current = null;
      if (suppressDraftPersistenceRef.current) return;
      writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(flushPayload));
    }, 400);
    return () => {
      if (sessionDraftTimerRef.current) {
        clearTimeout(sessionDraftTimerRef.current);
        sessionDraftTimerRef.current = null;
      }
    };
  }, [
    editPostId,
    category.id,
    skinKey,
    title,
    description,
    price,
    region,
    city,
    images,
    isFreeShare,
    isPriceOfferEnabled,
    isDirectDeal,
    tradeTopicChildId,
    neighborhood,
    buildingName,
    estateType,
    dealType,
    deposit,
    monthly,
    managementFee,
    hasPremium,
    areaSqm,
    roomCount,
    bathroomCount,
    moveInDate,
    carModel,
    carYear,
    mileage,
    usedCarTrade,
    carHasAccident,
    salary,
    workPlace,
    workType,
    currency,
    exchangeRate,
    tradeChatCallPolicy,
    descriptionAppend,
    tradeMeetSpot,
    usedCarBrandKey,
    usedCarModelKey,
    usedCarMileagePresetKey,
    usedCarBodyTypeKey,
    draftResumeGate,
    tradeWriteSucceededClearBlocking,
    assembleTradeWriteFlushPayload,
  ]);

  useEffect(() => {
    return () => {
      if (editPostId) return;
      if (tradeWriteSucceededClearBlocking) return;
      if (suppressDraftPersistenceRef.current) return;
      const snap = tradeDraftFlushRef.current;
      if (!snap) return;
      if (!tradeWriteSessionDraftLooksFilled(snap)) return;
      writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(snap));
    };
  }, [editPostId, draftResumeGate, tradeWriteSucceededClearBlocking]);

  useEffect(() => {
    if (editPostId) return;
    const flush = () => {
      if (tradeWriteSucceededClearBlocking) return;
      if (suppressDraftPersistenceRef.current) return;
      const snap = tradeDraftFlushRef.current;
      if (!snap || !tradeWriteSessionDraftLooksFilled(snap)) return;
      writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(snap));
    };
    window.addEventListener("beforeunload", flush);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [editPostId, tradeWriteSucceededClearBlocking]);

  /**
   * 업로드 없이 현재 필드를 세션 초안에 반영 — 거래 희망 장소 지도로 즉시 이동할 때 사용.
   * `forcePersist`: 지도·주소 이동 직전 등 looksFilled 와 무관하게 세션에 남길 때.
   */
  const flushTradeWriteSessionDraftSync = useCallback((forcePersist = false) => {
    if (editPostId) return;
    if (suppressDraftPersistenceRef.current) return;
    setTradeWriteRestoreAfterAddressFlag(category.id);
    const payload = assembleTradeWriteFlushPayload(images);
    tradeDraftFlushRef.current = payload;
    if (forcePersist || tradeWriteSessionDraftLooksFilled(payload)) {
      const built = buildTradeWriteFormSessionDraft(payload);
      writeTradeWriteFormSessionDraft(built);
      persistTradeWriteMeetSpotStaging(category.id, built);
    }
  }, [editPostId, category.id, assembleTradeWriteFlushPayload, images]);

  /**
   * 나가기·시트 닫기 직전 — Jobs/환전과 같이 미업로드 사진을 올린 뒤 초안에 https URL로 남김.
   */
  const persistTradeWriteSnapshotBeforeLeaveAsync = useCallback(async () => {
    if (editPostId) return;
    /** 나가기만 한 경우에는 플래그 없음 → 재진입 시 이어쓰기/새로 작성 시트(중고·부동산·중고차 공통) */
    const workingImages = await uploadPendingTradeWriteImages();
    const payload = assembleTradeWriteFlushPayload(workingImages);
    tradeDraftFlushRef.current = payload;
    if (tradeWriteSessionDraftLooksFilled(payload)) {
      writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(payload));
    }
  }, [editPostId, category.id, uploadPendingTradeWriteImages, assembleTradeWriteFlushPayload]);

  useEffect(() => {
    if (!tradeWriteSheet) return;
    const ref = tradeWriteSheet.persistSnapshotBeforeLeaveRef;
    ref.current = async () => {
      if (editPostId) return;
      const prev = suppressDraftPersistenceRef.current;
      suppressDraftPersistenceRef.current = false;
      try {
        await persistTradeWriteSnapshotBeforeLeaveAsync();
      } finally {
        suppressDraftPersistenceRef.current = prev;
      }
    };
    return () => {
      ref.current = null;
    };
  }, [tradeWriteSheet, editPostId, persistTradeWriteSnapshotBeforeLeaveAsync]);

  /**
   * 주소 관리 화면으로 가기 직전: 미업로드 사진을 스토리지에 올린 뒤 세션 초안 저장.
   */
  const handleBeforeNavigateToAddresses = useCallback(async () => {
    if (editPostId) return;
    if (suppressDraftPersistenceRef.current) return;
    setTradeWriteRestoreAfterAddressFlag(category.id);
    const workingImages = await uploadPendingTradeWriteImages();
    if (suppressDraftPersistenceRef.current) return;
    const payload = assembleTradeWriteFlushPayload(workingImages);
    tradeDraftFlushRef.current = payload;
    const built = buildTradeWriteFormSessionDraft(payload);
    writeTradeWriteFormSessionDraft(built);
    persistTradeWriteMeetSpotStaging(category.id, built);
  }, [editPostId, category.id, uploadPendingTradeWriteImages, assembleTradeWriteFlushPayload]);

  useEffect(() => {
    if (!editPostId || !ownerEditSnapshot) return;
    const h = hydrateTradeWriteFormFromSnapshot(skinKey, ownerEditSnapshot);
    setTitle(h.title);
    setDescription(h.description);
    setPrice(h.price);
    setRegion(h.region);
    setCity(h.city);
    setImages(skinKey === "used-car" && h.usedCarTrade === "buy" ? [] : h.images);
    setIsFreeShare(h.isFreeShare);
    setIsPriceOfferEnabled(h.isPriceOfferEnabled);
    setIsDirectDeal(h.isDirectDeal);
    setTradeTopicChildId(h.tradeTopicChildId);
    setNeighborhood(h.neighborhood);
    setBuildingName(h.buildingName);
    setEstateType(h.estateType);
    setDealType(h.dealType);
    setDeposit(h.deposit);
    setMonthly(h.monthly);
    setManagementFee(h.managementFee);
    setHasPremium(h.hasPremium);
    setAreaSqm(h.areaSqm);
    setRoomCount(h.roomCount);
    setBathroomCount(h.bathroomCount);
    setMoveInDate(h.moveInDate);
    setCarModel(h.carModel);
    setCarYear(h.carYear.replace(/\D/g, "").slice(0, 4));
    {
      const mi = String(h.mileage ?? "").replace(/\D/g, "");
      setMileage(mi ? formatPriceInput(mi) : "");
    }
    setUsedCarTrade(h.usedCarTrade);
    setCarHasAccident(h.carHasAccident);
    setTransmission(h.transmission ?? "");
    setFuelType(h.fuelType ?? "");
    if (skinKey === "used-car" && h.usedCarTrade === "sell") {
      setUsedCarBrandKey(h.usedCarBrandKey ?? "");
      setUsedCarModelKey(h.usedCarModelKey ?? "");
      setUsedCarMileagePresetKey(h.usedCarMileagePresetKey ?? "");
      setUsedCarBodyTypeKey("");
    } else if (skinKey === "used-car" && h.usedCarTrade === "buy") {
      setUsedCarBrandKey("");
      setUsedCarModelKey("");
      setUsedCarMileagePresetKey("");
      setUsedCarBodyTypeKey((h.usedCarBodyTypeKey ?? "").trim());
    } else {
      setUsedCarBrandKey("");
      setUsedCarModelKey("");
      setUsedCarMileagePresetKey("");
      setUsedCarBodyTypeKey("");
    }
    setSalary(h.salary);
    setWorkPlace(h.workPlace);
    setWorkType(h.workType);
    setCurrency(h.currency);
    setExchangeRate(h.exchangeRate);
    setTradeChatCallPolicy(h.tradeChatCallPolicy);
    const rawMeta = ownerEditSnapshot.meta;
    const ts =
      rawMeta && typeof rawMeta === "object" && rawMeta !== null
        ? (rawMeta as Record<string, unknown>).trade_meet_spot
        : null;
    setTradeMeetSpot(tradeMeetSpotFromMetaSnapshot(ts));
  }, [editPostId, ownerEditSnapshot, skinKey]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (skinKey !== "real-estate" && !isUsedCarSkin && !title.trim()) next.title = t("trade_102");
    if (isUsedCarSkin && !usedCarTrade) next.usedCarTrade = t("trade_write_err_pick_buy_sell");
    if (isUsedCarSkin && usedCarTrade === "buy") {
      if (!usedCarBodyTypeKey.trim()) next.usedCarBodyType = t("trade_write_err_body_type");
      const yErr = getUsedCarYearFieldError(carYear, "buy", t);
      if (yErr) next.carYear = yErr;
    } else if (isUsedCarSkin && usedCarTrade === "sell") {
      const yErr = getUsedCarYearFieldError(carYear, "sell", t);
      if (yErr) next.carYear = yErr;
      if (!carModel.trim()) next.carModel = t("trade_write_err_brand_model");
      const mileageDigits = mileage.replace(/\D/g, "");
      if (!mileageDigits) next.mileage = t("trade_write_err_mileage");
    }
    if (!description.trim()) next.description = t("trade_write_err_content");
    const isRealEstateSale = skinKey === "real-estate" && dealType === "판매";
    const effectiveFreeShare = isUsedCarSkin ? false : isFreeShare;
    if (hasPrice && !effectiveFreeShare && (skinKey !== "real-estate" || isRealEstateSale)) {
      const priceNum = price.trim() ? Number(price.replace(/,/g, "")) : NaN;
      if (!price.trim() || isNaN(priceNum) || priceNum < 0) {
        next.price = isRealEstateSale ? t("trade_write_err_sale_price") : t("trade_write_err_price");
      }
    }
    if (
      hasLocation &&
      (tradeAddressSsot.nationalStatus !== "resolved" || !tradeAddressSsot.tradeLguId)
    ) {
      next.location = t("trade_write_err_region_read");
    }
    if (hasLocation && (!tradeAddressSsot.ready || tradeAddressSsot.missing)) {
      next.location = t("trade_write_err_region_read");
    }
    if (skinKey === "real-estate") {
      const compErrs = validateAdaptedCompositionValues(
        realEstateAdaptedFields,
        realEstateFieldValues,
        (fieldId) => {
          const label = tradeFieldAdminLabel(fieldId, language === "en" ? "en" : "ko");
          return language === "en" ? `Enter ${label}` : `${label}을(를) 입력해 주세요`;
        }
      );
      Object.assign(next, compErrs);
      if (compErrs.price) next.price = compErrs.price;
    }
    if (skinKey === "used-car") {
      const compErrs = validateAdaptedCompositionValues(
        usedCarAdaptedFields,
        usedCarFieldValues,
        (fieldId) => {
          const label = tradeFieldAdminLabel(fieldId, language === "en" ? "en" : "ko");
          return language === "en" ? `Enter ${label}` : `${label}을(를) 입력해 주세요`;
        }
      );
      const UC_MAP: Record<string, string> = {
        car_trade: "usedCarTrade",
        make: "carModel",
        model: "carModel",
        year: "carYear",
        mileage: "mileage",
        body_type: "usedCarBodyType",
        price: "price",
        description: "description",
      };
      for (const [id, msg] of Object.entries(compErrs)) {
        const k = UC_MAP[id] ?? id;
        if (!next[k]) next[k] = msg;
      }
    }
    if (skinKey !== "real-estate" && skinKey !== "used-car") {
      const compErrs = validateAdaptedCompositionValues(
        generalAdaptedFields,
        generalFieldValues,
        (fieldId) => {
          const label = tradeFieldAdminLabel(fieldId, language === "en" ? "en" : "ko");
          return language === "en" ? `Enter ${label}` : `${label}을(를) 입력해 주세요`;
        }
      );
      if (compErrs.title && !next.title) next.title = compErrs.title;
      if (compErrs.price && !next.price) next.price = compErrs.price;
      if (compErrs.description && !next.description) next.description = compErrs.description;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [
    title,
    description,
    price,
    hasPrice,
    hasLocation,
    isFreeShare,
    isUsedCarSkin,
    usedCarTrade,
    usedCarBodyTypeKey,
    carYear,
    carModel,
    mileage,
    region,
    city,
    effectiveTradeRegionId,
    effectiveTradeCityId,
    skinKey,
    dealType,
    realEstateAdaptedFields,
    realEstateFieldValues,
    usedCarAdaptedFields,
    usedCarFieldValues,
    generalAdaptedFields,
    generalFieldValues,
    language,
    tradeAddressSsot,
    t,
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        const pathFallback =
          pathname || (editPostId ? `/products/${editPostId}/edit` : `/write/${category.slug}`);
        if (editPostId) {
          if (!(await ensureClientAccessOrRedirectAsync(router, pathFallback))) {
            return;
          }
        } else if (!(await requireAuthAction("trade_create_item", async () => {}, { next: pathFallback }))) {
          return;
        }
        const user = getCurrentUser();
        const skipUsedCarBuyImages = isUsedCarSkin && usedCarTrade === "buy";
        const files = skipUsedCarBuyImages
          ? []
          : images.map((item) => item.file).filter((f): f is File => !!f);
        const existingUrls = images
          .filter((item) => !item.file && item.url && !item.url.startsWith("blob:"))
          .map((item) => item.url);

        let mergedImageUrls: string[];
        let uploadedFileResults: string[] = [];
        /** 신규 등록: 스토리지 업로드 + userId + 전화 게이트 병렬 → `createPost` 에서 프로필 API 중복 호출 생략 */
        let createPreflight: { userId: string; phoneGatePassed: true } | undefined;

        if (editPostId) {
          uploadedFileResults =
            files.length > 0 && user?.id ? await uploadPostImages(files, user.id) : [];
          mergedImageUrls = [...existingUrls, ...uploadedFileResults];
        } else {
          const uploadPromise =
            files.length > 0 && user?.id ? uploadPostImages(files, user.id) : Promise.resolve<string[]>([]);
          const [uploaded, preflightUserId] = await Promise.all([
            uploadPromise,
            getCurrentUserIdForDb(),
          ]);
          uploadedFileResults = uploaded;
          if (!preflightUserId) {
            setErrors({ submit: t("trade_write_err_login") });
            return;
          }
          createPreflight = { userId: preflightUserId, phoneGatePassed: true };
          mergedImageUrls = [...existingUrls, ...uploadedFileResults];
        }
        if (files.length > 0 && uploadedFileResults.length !== files.length) {
          setErrors({
            submit: t("trade_write_err_upload_partial", {
              total: files.length,
              uploaded: uploadedFileResults.length,
            }),
          });
          return;
        }
        if (skipUsedCarBuyImages) {
          mergedImageUrls = editPostId ? [] : [];
        }
        /** 수정 시 빈 배열을 넘겨야 기존 이미지가 DB에서 제거됨(undefined면 update가 images를 건드리지 않음) */
        const imageUrlsForSave = editPostId
          ? mergedImageUrls
          : mergedImageUrls.length > 0
            ? mergedImageUrls
            : undefined;

        const submitFreeShare = isUsedCarSkin ? false : isFreeShare;
        const priceToSend =
          hasPrice && !submitFreeShare && price.trim()
            ? Number(price.replace(/,/g, ""))
            : null;
        const submitRegion = effectiveTradeRegionId.trim();
        const submitCity = effectiveTradeCityId.trim();
        const derivedNeighborhood =
          skinKey === "real-estate"
            ? REGIONS.find((r) => r.id === submitRegion)?.cities.find((c) => c.id === submitCity)?.name ?? ""
            : neighborhood;
        let meta = buildTradeMeta(skinKey, {
          neighborhood: derivedNeighborhood,
          buildingName,
          estateType,
          dealType,
          deposit,
          monthly,
          managementFee,
          hasPremium,
          areaSqm,
          roomCount,
          bathroomCount,
          moveInDate,
          carModel,
          carYear,
          mileage,
          carTrade: usedCarTrade,
          usedCarBodyTypeKey,
          carHasAccident,
          transmission,
          fuelType,
          salary,
          workPlace,
          workType,
          currency,
          exchangeRate,
        });
        if (isDirectDeal && !isUsedCarSkin) meta = { ...meta, direct_deal: true };
        meta = { ...meta, trade_chat_call_policy: tradeChatCallPolicy };
        if (hasLocation) {
          const meetMeta = buildTradeMeetSpotMetaForPersist(tradeMeetSpot);
          if (meetMeta) meta = { ...meta, ...meetMeta };
        }
        const usedCarPostTitle =
          usedCarTrade === "buy"
            ? t("trade_write_auto_title_buy", {
                detail: `${labelForUsedCarBodyTypeKey(usedCarBodyTypeKey, t)}${carModel.trim() ? ` · ${carModel.trim()}` : ""}`,
              })
            : usedCarTrade === "sell"
              ? carModel.trim()
                ? t("trade_write_auto_title_sell", { detail: carModel.trim() })
                : t("trade_write_auto_title_sell_only")
              : "";
        const locShort = getLocationLabel(submitRegion, submitCity).trim();
        const bn = buildingName.trim();
        const dt = dealType.trim();
        const postTitle =
          skinKey === "real-estate"
            ? bn
              ? dt
                ? `${bn} · ${dt}`
                : bn
              : locShort
                ? dt
                  ? `${locShort} · ${dt}`
                  : locShort
                : dt || ""
            : isUsedCarSkin
              ? usedCarPostTitle
              : title.trim();
        const payload = {
          type: "trade" as const,
          categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
          title: postTitle || (isUsedCarSkin ? usedCarPostTitle : title.trim()),
          content: description.trim(),
          price: priceToSend,
          isPriceOfferEnabled,
          isFreeShare: submitFreeShare,
          region: submitRegion || undefined,
          city: submitCity || undefined,
          tradeLguId: tradeAddressSsot.tradeLguId ?? undefined,
          barangay: undefined,
          imageUrls: imageUrlsForSave,
          meta,
        };
        if (editPostId) {
          const res = await updateTradePostFromCreatePayload(editPostId, payload, {
            descriptionAppend:
              showDescriptionAppend && descriptionAppend.trim()
                ? descriptionAppend.trim()
                : undefined,
          });
          if (res.ok) {
            tradeDraftFlushRef.current = null;
            clearTradeWriteFormSessionDraft(category.id);
            clearTradeWriteMeetSpotStaging(category.id);
            clearTradeMeetSpotSessionNavigationState();
            setTradeWriteSucceededClearBlocking(true);
            invalidateHomePostsCache();
            onSuccess(editPostId);
          } else {
            if (redirectForBlockedAction(router, res.error, pathname || `/products/${editPostId}/edit`)) {
              return;
            }
            setErrors({ submit: res.error });
          }
        } else {
          const res = await createPost(payload, createPreflight);
          if (res.ok) {
            tradeDraftFlushRef.current = null;
            clearTradeWriteFormSessionDraft(category.id);
            clearTradeWriteMeetSpotStaging(category.id);
            clearTradeMeetSpotSessionNavigationState();
            setTradeWriteSucceededClearBlocking(true);
            invalidateHomePostsCache();
            onSuccess(res.id);
          } else {
            if (redirectForBlockedAction(router, res.error, pathname || `/write/${category.slug}`)) return;
            setErrors({ submit: res.error });
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      category,
      tradeTopicChildId,
      skinKey,
      dealType,
      title,
      usedCarTrade,
      description,
      price,
      hasPrice,
      isFreeShare,
      isPriceOfferEnabled,
      region,
      city,
      images,
      isDirectDeal,
      isUsedCarSkin,
      neighborhood,
      buildingName,
      estateType,
      deposit,
      monthly,
      managementFee,
      hasPremium,
      areaSqm,
      roomCount,
      bathroomCount,
      moveInDate,
      carModel,
      carYear,
      mileage,
      usedCarBodyTypeKey,
      carHasAccident,
      transmission,
      fuelType,
      salary,
      workPlace,
      workType,
      currency,
      exchangeRate,
      validate,
      onSuccess,
      router,
      pathname,
      editPostId,
      showDescriptionAppend,
      descriptionAppend,
      tradeChatCallPolicy,
      hasLocation,
      tradeAddressSsot,
      tradeMeetSpot,
      effectiveTradeRegionId,
      effectiveTradeCityId,
      t,
    ]
  );

  /**
   * 세션 초안은 https 이미지 URL만 저장한다. 업로드·초안 저장을 끝낸 뒤 라우팅한다.
   * `suppressDraftPersistenceRef`(폐기 이벤트 직후 등)가 켜져 있으면 주소/지도 저장 헬퍼가 조용히 빠져
   * 이미지·필드가 안 남을 수 있어, 지도 진입 직전에만 잠시 해제한다.
   */
  const handleBeforeMeetSpotPick = useCallback(async () => {
    /** 인라인 시트 상태에서는 거래 카테고리 경로로 복귀시키고 시트를 다시 열게 한다. */
    const returnTo = tradeWriteSheet ? getCategoryHref(category) : resolveTradeMeetSpotReturnTo();
    if (!editPostId) {
      const prevSuppress = suppressDraftPersistenceRef.current;
      suppressDraftPersistenceRef.current = false;
      try {
        try {
          await handleBeforeNavigateToAddresses();
        } catch {
          flushTradeWriteSessionDraftSync(true);
        }
      } finally {
        suppressDraftPersistenceRef.current = prevSuppress;
      }
    }
    prepareTradeMeetSpotMapNavigation(tradeMeetSpot);
    persistTradeMeetSpotReturnScrollPosition();
    markTradeMeetSpotFocusOnReturn();
    router.push(hrefTradeMeetSpotPick(returnTo));
  }, [
    editPostId,
    flushTradeWriteSessionDraftSync,
    handleBeforeNavigateToAddresses,
    router,
    category,
    tradeMeetSpot,
    tradeWriteSheet,
  ]);

  const pendingMeetSpotFocusRef = useRef(false);

  /** 시트 재오픈(`openEpoch`)·경로 변경 직후에도 1회 반영 — `useEffect`만 쓰면 시트 폼보다 늦을 수 있음 */
  useLayoutEffect(() => {
    const shouldFocusOnReturn = consumeTradeMeetSpotFocusOnReturn();
    const next = peekTradeMeetSpotPickResult();
    if (next) {
      applyMeetSpotPick(next);
      /** dev Strict Mode 이중 레이아웃 사이에 세션을 비우지 않도록 페인트 뒤 1회만 제거 */
      requestAnimationFrame(() => {
        clearTradeMeetSpotPickResult();
      });
    }
    /** 복귀 시 위치 블록 포커스를 최우선으로 하고, 그 외에는 기존 스크롤 복원 유지 */
    if (shouldFocusOnReturn) {
      pendingMeetSpotFocusRef.current = true;
    } else {
      restoreTradeMeetSpotReturnScrollPosition();
    }
  }, [pathname, tradeWriteSheetEpoch, category.id, applyMeetSpotPick]);

  useEffect(() => {
    if (!pendingMeetSpotFocusRef.current) return;
    const run = () => {
      scrollTradeMeetSpotAnchorIntoView();
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    const t = window.setTimeout(run, 140);
    pendingMeetSpotFocusRef.current = false;
    return () => window.clearTimeout(t);
  }, [tradeMeetSpot, tradeWriteSheetEpoch, pathname]);

  useEffect(() => {
    const onPageShow = () => {
      const next = consumeTradeMeetSpotPickResult();
      if (next) applyMeetSpotPick(next);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [applyMeetSpotPick]);

  const backHref = editPostId ? `/post/${editPostId}` : getCategoryHref(category);

  const tradeWriteHeaderTitle = useMemo(() => {
    if (editPostId) return `${categoryLabel} · ${t("trade_write_header_edit_suffix")}`;
    if (effectiveTradeRegionId && effectiveTradeCityId && hasLocation) {
      return t("trade_write_header_post_in_region", {
        region: getLocationLabel(effectiveTradeRegionId, effectiveTradeCityId),
      });
    }
    return `${categoryLabel} · ${t("trade_write_header_post_suffix")}`;
  }, [
    editPostId,
    categoryLabel,
    effectiveTradeRegionId,
    effectiveTradeCityId,
    hasLocation,
    t,
  ]);

  const karrotMeetSpotDisplayLine = useMemo(() => {
    const fromMap = tradeMeetSpot?.displayLine?.trim();
    if (fromMap) return fromMap;
    return tradeAddressSsot.displayLine?.trim() ?? "";
  }, [tradeMeetSpot, tradeAddressSsot.displayLine]);

  const tradeLocationEl = hasLocation ? (
    <div id={TRADE_MEET_SPOT_SCROLL_ANCHOR_ID} className={locationLocked || coreLocked ? "pointer-events-none opacity-60" : ""}>
      <TradeDefaultLocationBlock
        category={category}
        editPostId={editPostId}
        region={region}
        city={city}
        onSyncRegionCity={syncTradeRegionCity}
        error={errors.location}
        readOnly={locationLocked || coreLocked}
        onBeforeNavigateToAddresses={!editPostId ? handleBeforeNavigateToAddresses : undefined}
        onAddressResolved={setTradeAddressSsot}
        karrotMeetSpotUi={hasLocation}
        meetSpotLine={karrotMeetSpotDisplayLine || null}
        meetSpotError={errors.meetSpot}
        onBeforeMeetSpotPick={
          hasLocation && !locationLocked && !coreLocked ? () => void handleBeforeMeetSpotPick() : undefined
        }
        meetSpotHeading={t("trade_write_location")}
        belowMeetSpotSlot={undefined}
        denseLayout
      />
    </div>
  ) : null;

  return (
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-sam-app pb-24"
          : "min-h-screen bg-sam-app pb-24"
      }
    >
      <MobileDualActionBottomSheet
        open={draftResumeGate === "pending_choice"}
        onClose={() => {}}
        title={t("trade_099")}
        description={t("trade_write_draft_resume_body")}
        secondaryLabel={t("trade_write_draft_resume_new")}
        onSecondary={handleDiscardPersistedDraft}
        primaryLabel={t("trade_write_draft_resume_continue")}
        onPrimary={handleResumePersistedDraft}
        primaryTone="primary"
        zIndexClass="z-[72]"
        ariaLabel={t("trade_write_draft_resume_aria")}
        interactionMode="blocking"
      />
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={tradeWriteHeaderTitle}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <form onSubmit={handleSubmit} className={APP_TRADE_WRITE_FORM_FB_STACK_CLASS}>
        {tradePolicy?.hint ? (
          <div className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-3 py-1.5 sam-text-body-secondary text-sam-warning">
            {tradePolicy.hint}
          </div>
        ) : null}
        {!(isUsedCarSkin && usedCarTrade === "buy") ? (
          <div className={TRADE_WRITE_FB_SECTION}>
            <ImageUploader
              value={images}
              onChange={setImages}
              maxCount={maxProductImages}
              label={t("trade_write_photos")}
              disabled={coreLocked}
              compact={false}
              variant="karrot"
            />
          </div>
        ) : null}
        <div className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
          <WriteTradeTopicSection
            category={category}
            value={tradeTopicChildId}
            onChange={setTradeTopicChildId}
            compact
          />
        </div>
        {skinKey === "real-estate" && hasLocation ? tradeLocationEl : null}
        {skinKey === "used-car" ? (
          <>
            <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
              <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>
                {t("trade_write_kind")} <span className="text-sam-danger">*</span>
              </h4>
              <div className="flex flex-wrap gap-3 pt-0.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={usedCarTrade === "sell"}
                    onChange={(e) => setUsedCarTrade(e.target.checked ? "sell" : null)}
                    className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
                  />
                  <span className="sam-text-body text-sam-fg">{t("trade_126")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={usedCarTrade === "buy"}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked) setImages([]);
                      setUsedCarTrade(checked ? "buy" : null);
                    }}
                    className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
                  />
                  <span className="sam-text-body text-sam-fg">{t("trade_071")}</span>
                </label>
              </div>
              {(errors.usedCarTrade || errors.title) && (
                <p className="mt-1.5 text-[12px] text-red-600">{errors.usedCarTrade || errors.title}</p>
              )}
            </section>
            {usedCarTrade === "buy" ? (
              <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
                <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>
                  {t("trade_write_wanted_model")} <span className="font-normal text-[#8a8d91]">{t("trade_001")}</span>
                </h4>
                <input
                  type="text"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  readOnly={coreLocked}
                  placeholder=""
                  maxLength={100}
                  className={`mt-0.5 w-full ${TRADE_WRITE_FB_CONTROL}`}
                />
              </section>
            ) : null}
          </>
        ) : (
          <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
            <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>
              {t("trade_write_title")} <span className="text-sam-danger">*</span>
            </h4>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={coreLocked}
              placeholder=""
              maxLength={100}
              className={`mt-0.5 w-full ${TRADE_WRITE_FB_CONTROL}`}
              aria-invalid={!!errors.title}
            />
            {errors.title ? <p className="mt-1 text-[12px] text-red-600">{errors.title}</p> : null}
          </section>
        )}
        <section className={TRADE_WRITE_FB_SECTION}>
          <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>
            {t("trade_write_content")} <span className="text-sam-danger">*</span>
          </h4>
          <AutoGrowTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={coreLocked || showDescriptionAppend}
            placeholder=""
            className={`w-full ${PHILIFE_FB_TEXTAREA_CLASS} mt-0.5 min-h-[100px] rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[15px] text-[#050505] outline-none placeholder:text-[#8a8d91] focus:border-sam-primary`}
            aria-invalid={!!errors.description}
          />
          {!showDescriptionAppend ? (
            <>
              <button
                type="button"
                className="mt-1.5 rounded-ui-rect border border-sam-border bg-sam-surface-muted px-2 py-1 text-[11px] leading-snug text-sam-fg"
                onClick={() => setFrequentPhrasesOpen(true)}
              >
                {t("trade_write_frequent_phrases")}
              </button>
              <TradeFrequentPhrasesSheet
                open={frequentPhrasesOpen}
                onClose={() => setFrequentPhrasesOpen(false)}
                onPickPhrase={(text) => {
                  setDescription((d) => (d.trim() ? `${d}\n\n${text}` : text));
                }}
              />
            </>
          ) : null}
          {errors.description && <p className="mt-1 text-[12px] text-red-600">{errors.description}</p>}
          {showDescriptionAppend ? (
            <div className="mt-2 border-t border-[#e4e6eb] pt-2">
              <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_116")}</label>
              <AutoGrowTextarea
                value={descriptionAppend}
                onChange={(e) => setDescriptionAppend(e.target.value)}
                placeholder=""
                className={`mt-0.5 w-full ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[84px] rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[15px] outline-none focus:border-sam-primary`}
              />
            </div>
          ) : null}
        </section>
        {(hasPrice || (hasFreeShare && !isUsedCarSkin)) &&
          skinKey !== "real-estate" &&
          !(isUsedCarSkin && usedCarTrade === "buy") && (
          <section className={TRADE_WRITE_FB_SECTION}>
            {((hasFreeShare && !isUsedCarSkin) || (hasDirectDeal && !isUsedCarSkin)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-1">
                {hasFreeShare && hasDirectDeal && !isUsedCarSkin ? (
                  isKarrotGeneral ? (
                    <div role="radiogroup" aria-label={t("trade_014")} className="flex w-full gap-2">
                      <button
                        type="button"
                        className={`flex-1 rounded-full border px-4 py-2.5 sam-text-body font-medium transition ${!isFreeShare ? KARROT_PILL_ACTIVE : KARROT_PILL_IDLE}`}
                        onClick={() => {
                          setIsFreeShare(false);
                          setIsDirectDeal(true);
                        }}
                      >
                        {t("trade_write_sell_cta")}
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-full border px-4 py-2.5 sam-text-body font-medium transition ${isFreeShare ? KARROT_PILL_ACTIVE : KARROT_PILL_IDLE}`}
                        onClick={() => {
                          setIsFreeShare(true);
                          setIsDirectDeal(false);
                        }}
                      >
                        {t("trade_write_share_cta")}
                      </button>
                    </div>
                  ) : (
                  <div role="radiogroup" aria-label={t("trade_014")} className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="samarket-trade-share-mode"
                        className="border-sam-border text-sam-primary focus:ring-sam-primary/30"
                        checked={!isFreeShare}
                        onChange={() => {
                          setIsFreeShare(false);
                          setIsDirectDeal(true);
                        }}
                      />
                      <span className="sam-text-body text-sam-fg">{t("trade_108")}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="samarket-trade-share-mode"
                        className="border-sam-border text-sam-primary focus:ring-sam-primary/30"
                        checked={isFreeShare}
                        onChange={() => {
                          setIsFreeShare(true);
                          setIsDirectDeal(false);
                        }}
                      />
                      <span className="sam-text-body text-sam-fg">{t("trade_050")}</span>
                    </label>
                  </div>
                  )
                ) : (
                  <>
                    {hasFreeShare && !isUsedCarSkin && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isFreeShare}
                          onChange={(e) => setIsFreeShare(e.target.checked)}
                          className="rounded border-sam-border"
                        />
                        <span className="sam-text-body text-sam-fg">{t("trade_050")}</span>
                      </label>
                    )}
                    {hasDirectDeal && !isUsedCarSkin && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isDirectDeal}
                          onChange={(e) => setIsDirectDeal(e.target.checked)}
                          className="rounded border-sam-border"
                        />
                        <span className="sam-text-body text-sam-fg">{t("trade_108")}</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
            {hasPrice && (!isFreeShare || isUsedCarSkin) && (
              <>
                <label
                  className={`${TRADE_WRITE_FB_FIELD_LABEL} ${!isUsedCarSkin && (hasFreeShare || hasDirectDeal) ? "mt-1" : ""}`}
                >
                  {t("trade_write_price")} <span className="text-sam-danger">*</span>
                </label>
                <div
                  className={`${TRADE_WRITE_FB_CONTROL_ROW} focus-within:ring-2 focus-within:ring-signature/20`}
                >
                  <span className="shrink-0 sam-text-body font-medium text-sam-muted">
                    {getCurrencyUnitLabel(appSettings.defaultCurrency)}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                    placeholder={t("trade_006")}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body text-sam-fg outline-none placeholder:text-sam-meta"
                    aria-invalid={!!errors.price}
                  />
                </div>
                {errors.price && <p className="mt-1 text-[12px] text-red-600">{errors.price}</p>}
                {allowPriceOffer && (
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPriceOfferEnabled}
                      onChange={(e) => setIsPriceOfferEnabled(e.target.checked)}
                      className={`rounded border-sam-border ${isKarrotGeneral ? "accent-signature" : ""}`}
                    />
                    <span className="sam-text-body-secondary text-sam-muted">{t("trade_004")}</span>
                  </label>
                )}
              </>
            )}
          </section>
        )}
        {skinKey === "real-estate" && (
          <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
            <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>{t("trade_021")}</h4>
            <GenericTradeWriteFields
              fields={realEstateAdaptedFields}
              values={realEstateFieldValues}
              onChange={onRealEstateCompositionChange}
              errors={errors}
              disabled={coreLocked}
              currencyUnit={currencyUnit}
            />
          </section>
        )}
        {skinKey === "used-car" && (
          <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
            <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>{t("trade_112")}</h4>
            {usedCarTrade === "buy" ? (
              <UsedCarBuyFields
                bodyTypeKey={usedCarBodyTypeKey}
                setBodyTypeKey={setUsedCarBodyTypeKey}
                carYear={carYear}
                setCarYear={setCarYear}
                price={price}
                setPrice={setPrice}
                currencyUnitLabel={getCurrencyUnitLabel(appSettings.defaultCurrency)}
                isPriceOfferEnabled={isPriceOfferEnabled}
                setIsPriceOfferEnabled={setIsPriceOfferEnabled}
                allowPriceOffer={allowPriceOffer}
                disabled={coreLocked}
                errors={{
                  bodyType: errors.usedCarBodyType,
                  carYear: errors.carYear,
                  price: errors.price,
                }}
              />
            ) : (
              <div className="space-y-2">
                <UsedCarSellFields
                  carModel={carModel}
                  setCarModel={setCarModel}
                  carYear={carYear}
                  setCarYear={setCarYear}
                  mileage={mileage}
                  setMileage={setMileage}
                  brandKey={usedCarBrandKey}
                  setBrandKey={setUsedCarBrandKey}
                  modelKey={usedCarModelKey}
                  setModelKey={setUsedCarModelKey}
                  mileagePresetKey={usedCarMileagePresetKey}
                  setMileagePresetKey={setUsedCarMileagePresetKey}
                  transmission={transmission}
                  setTransmission={setTransmission}
                  fuelType={fuelType}
                  setFuelType={setFuelType}
                  errors={{
                    carYear: errors.carYear,
                    carModel: errors.carModel,
                    mileage: errors.mileage,
                  }}
                />
                <label className="flex cursor-pointer items-center gap-2 pt-0.5 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={carHasAccident}
                    onChange={(e) => setCarHasAccident(e.target.checked)}
                    className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
                  />
                  <span className="sam-text-body-secondary text-sam-fg whitespace-nowrap">{t("trade_069")}</span>
                </label>
              </div>
            )}
          </section>
        )}
        {skinKey === "jobs" && (
          <section className={TRADE_WRITE_FB_SECTION}>
            <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>{t("trade_082")}</h4>
            <div className="space-y-2">
              <div>
                <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_042")}</label>
                <input
                  type="text"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder=""
                  className={TRADE_WRITE_FB_CONTROL}
                />
              </div>
              <div>
                <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_040")}</label>
                <input
                  type="text"
                  value={workPlace}
                  onChange={(e) => setWorkPlace(e.target.value)}
                  placeholder=""
                  className={TRADE_WRITE_FB_CONTROL}
                />
              </div>
              <div>
                <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_039")}</label>
                <input
                  type="text"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  placeholder=""
                  className={TRADE_WRITE_FB_CONTROL}
                />
              </div>
            </div>
          </section>
        )}
        {skinKey === "exchange" && (
          <section className={TRADE_WRITE_FB_SECTION}>
            <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>{t("trade_132")}</h4>
            <div className="space-y-2">
              <div>
                <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_121")}</label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder=""
                  className={TRADE_WRITE_FB_CONTROL}
                />
              </div>
              <div>
                <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_131")}</label>
                <input
                  type="text"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder=""
                  className={TRADE_WRITE_FB_CONTROL}
                />
              </div>
            </div>
          </section>
        )}
        {skinKey !== "real-estate" ? tradeLocationEl : null}
        <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
          <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>{t("trade_016")}</h4>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trade_chat_call_policy"
                className="mt-0"
                checked={tradeChatCallPolicy === "none"}
                onChange={() => setTradeChatCallPolicy("none")}
              />
              <span className="sam-text-body font-medium text-sam-fg">{t("trade_062")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trade_chat_call_policy"
                className="mt-0"
                checked={tradeChatCallPolicy === "voice_only"}
                onChange={() => setTradeChatCallPolicy("voice_only")}
              />
              <span className="sam-text-body font-medium text-sam-fg">{t("trade_097")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trade_chat_call_policy"
                className="mt-0"
                checked={tradeChatCallPolicy === "voice_and_video"}
                onChange={() => setTradeChatCallPolicy("voice_and_video")}
              />
              <span className="sam-text-body font-medium text-sam-fg">{t("trade_096")}</span>
            </label>
          </div>
        </section>
        {errors.submit && (
          <p className="px-4 py-2 sam-text-body-secondary text-sam-danger">{errors.submit}</p>
        )}
        <SubmitButton
          label={editPostId ? t("trade_write_submit_edit") : t("trade_write_submit")}
          submitting={submitting}
          submittingLabel={editPostId ? t("trade_write_submitting_edit") : t("trade_write_submitting")}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}

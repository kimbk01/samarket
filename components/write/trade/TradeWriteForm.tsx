"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  USED_CAR_FORM_YEAR_MIN,
  getUsedCarFormYearMax,
  findMileagePresetKeyForDigits,
  resolveUsedCarSellKeysFromStoredCarModel,
} from "@/lib/trade/used-car-form-catalog";
import { isUsedCarTradeWriteSkin, resolveTradeWriteSkinKey } from "@/lib/trade/resolve-trade-write-skin-key";
import { UsedCarSellFields } from "./UsedCarSellFields";

const REAL_ESTATE_TYPES = [
  { value: "", label: "선택" },
  { value: "상가", label: "상가" },
  { value: "주택", label: "주택" },
  { value: "콘도", label: "콘도" },
  { value: "주차장", label: "주차장" },
] as const;

const REAL_ESTATE_DEAL_TYPES = [
  { value: "임대", label: "임대" },
  { value: "판매", label: "판매" },
] as const;

const MOVE_IN_OPTIONS = [
  { value: "", label: "선택" },
  { value: "협의 가능", label: "협의 가능" },
  { value: "즉시입주", label: "즉시입주" },
] as const;

/** 중고차(차량) 연식 — DB·표시 모두 4자리 연도 */
function getUsedCarYearFieldError(raw: string, mode: "buy" | "sell"): string | null {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) {
    return mode === "buy" ? "년식 (이하)를 입력해 주세요." : "연식을 입력해 주세요.";
  }
  if (digits.length < 4) {
    return "연식은 네 자리 연도로 입력해 주세요.";
  }
  const y = parseInt(digits, 10);
  const max = getUsedCarFormYearMax();
  if (y < USED_CAR_FORM_YEAR_MIN || y > max) {
    return `연식은 ${USED_CAR_FORM_YEAR_MIN}년~${max}년 사이로 입력해 주세요.`;
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
    carHasAccident: boolean;
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
    if (v.carModel.trim()) o.car_model = v.carModel.trim();
    if (v.carTrade === "sell") {
      if (v.carYear.trim()) o.car_year = v.carYear.replace(/\D/g, "").slice(0, 4);
      const mileageDigits = v.mileage.replace(/,/g, "").replace(/\D/g, "");
      if (mileageDigits) o.mileage = mileageDigits;
      o.has_accident = v.carHasAccident === true;
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
import { assertPhoneAllowsPostWrite } from "@/lib/posts/phone-gate-for-post-write";
import { updateTradePostFromCreatePayload } from "@/lib/posts/updateTradePost";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { hydrateTradeWriteFormFromSnapshot } from "@/lib/posts/apply-owner-snapshot-to-trade-write-form";
import { normalizeTradeChatCallPolicy, type TradeChatCallPolicy } from "@/lib/trade/trade-chat-call-policy";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import {
  ensureClientAccessOrRedirectAsync,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel, formatPriceInput } from "@/lib/utils/format";
import { REGIONS, getLocationLabel, getLocationLabelIfValid } from "@/lib/products/form-options";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "../useWriteScreenEmbeddedTier1";
import { AutoGrowTextarea } from "../shared/AutoGrowTextarea";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { TradeFrequentPhrasesSheet } from "../shared/TradeFrequentPhrasesSheet";
import { TradeDefaultLocationBlock } from "../shared/TradeDefaultLocationBlock";
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
import { fetchRepresentativeTradeMeetFallbackLine } from "@/lib/addresses/representative-trade-meet-fallback-line";
import {
  pickPersistableMeetSpotCoords,
  tradeMeetSpotFromClientFields,
  tradeMeetSpotFromMetaSnapshot,
  type TradeMeetSpotValue,
} from "@/lib/posts/trade-meet-spot-types";
import { PHILIFE_FB_INPUT_CLASS, PHILIFE_FB_TEXTAREA_CLASS } from "@/lib/philife/philife-flat-ui-classes";
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
import { APP_TRADE_WRITE_FORM_CLASS } from "@/lib/ui/app-content-layout";
import {
  KARROT_INNER_BOX,
  KARROT_LABEL,
  KARROT_PILL_ACTIVE,
  KARROT_PILL_IDLE,
  KARROT_SECTION,
} from "./trade-karrot-classes";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import {
  hrefTradeMeetSpotPick,
  peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
  resolveTradeMeetSpotReturnTo,
  scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
} from "@/lib/navigation/trade-meet-spot-return-to";
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
  const router = useRouter();
  const pathname = usePathname();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const tradeWriteSheetEpoch = tradeWriteSheet?.openEpoch ?? 0;
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const appSettings = useMemo(() => getAppSettings(), []);
  const currencyUnit = getCurrencyUnitLabel(appSettings.defaultCurrency);
  const perMonthSuffix = `${currencyUnit}/month`;
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
  /** 지도 미선택 시 표시·저장 — 대표 주소 `buildTradePublicLine` (주소록 대표→거래 기본) */
  const [representativeTradeMeetFallbackLine, setRepresentativeTradeMeetFallbackLine] = useState<string | null>(
    null
  );
  const coreLocked = Boolean(editPostId && tradePolicy && !tradePolicy.allowEditCore);
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
  const prevUsedCarTradeRef = useRef<"buy" | "sell" | null>(usedCarTrade);
  /** 팝니다: 사고 이력 있음 */
  const [carHasAccident, setCarHasAccident] = useState(false);
  const [salary, setSalary] = useState("");
  const [workPlace, setWorkPlace] = useState("");
  const [workType, setWorkType] = useState("");
  const [currency, setCurrency] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [tradeTopicChildId, setTradeTopicChildId] = useState("");

  const prevWriteCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevWriteCategoryIdRef.current;
    prevWriteCategoryIdRef.current = category.id;
    if (prev === null) return;
    if (prev === category.id) return;
    setTradeTopicChildId("");
    if (!editPostId) setTradeChatCallPolicy("none");
  }, [category.id, editPostId]);

  useEffect(() => {
    if (!hasLocation) {
      setRepresentativeTradeMeetFallbackLine(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const line = await fetchRepresentativeTradeMeetFallbackLine();
      if (!cancelled) setRepresentativeTradeMeetFallbackLine(line);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasLocation]);

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
    if (isUsedCarSkin) return;
    setUsedCarBrandKey("");
    setUsedCarModelKey("");
    setUsedCarMileagePresetKey("");
  }, [isUsedCarSkin]);

  const syncTradeRegionCity = useCallback((rid: string, cid: string) => {
    setRegion(rid);
    setCity(cid);
  }, []);

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
    setImages(draftImagesToUploadItems(d.imageUrls ?? []));
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
    if (draftUsedCarSell) {
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
    } else {
      setUsedCarBrandKey("");
      setUsedCarModelKey("");
      setUsedCarMileagePresetKey("");
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
    ]
  );

  /** 미업로드 사진을 스토리지에 올린 뒤 URL 목록으로 맞춘다 — 초안·나가기 스냅샷 공통 */
  const uploadPendingTradeWriteImages = useCallback(async (): Promise<ImageUploadItem[]> => {
    const user = getCurrentUser();
    let workingImages = [...images];
    const files = workingImages.map((x) => x.file).filter((f): f is File => !!f);
    if (files.length === 0) return workingImages;
    if (!user?.id) {
      window.alert("로그인이 필요합니다. 로그인 후 다시 시도해 주세요.");
      throw new Error("no-user");
    }
    const uploaded = await uploadPostImages(files, user.id);
    if (uploaded.length !== files.length) {
      window.alert(
        `이미지 ${files.length}장 중 ${uploaded.length}장만 업로드되었습니다. 네트워크·저장소 설정을 확인한 뒤 다시 시도해 주세요.`
      );
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
    setUsedCarTrade(isUsedCarSkin ? "sell" : null);
    setCarHasAccident(false);
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
    setImages(h.images);
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
    if (skinKey === "used-car" && h.usedCarTrade === "sell") {
      setUsedCarBrandKey(h.usedCarBrandKey ?? "");
      setUsedCarModelKey(h.usedCarModelKey ?? "");
      setUsedCarMileagePresetKey(h.usedCarMileagePresetKey ?? "");
    } else {
      setUsedCarBrandKey("");
      setUsedCarModelKey("");
      setUsedCarMileagePresetKey("");
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
    if (skinKey !== "real-estate" && !isUsedCarSkin && !title.trim()) next.title = "제목을 입력해 주세요.";
    if (isUsedCarSkin && !usedCarTrade) next.usedCarTrade = "삽니다 또는 팝니다를 선택해 주세요.";
    if (isUsedCarSkin && usedCarTrade === "buy") {
      const yErr = getUsedCarYearFieldError(carYear, "buy");
      if (yErr) next.carYear = yErr;
    } else if (isUsedCarSkin && usedCarTrade === "sell") {
      const yErr = getUsedCarYearFieldError(carYear, "sell");
      if (yErr) next.carYear = yErr;
      if (!carModel.trim()) next.carModel = "브랜드·모델을 선택하거나 차종을 입력해 주세요.";
      const mileageDigits = mileage.replace(/\D/g, "");
      if (!mileageDigits) next.mileage = "주행거리를 선택하거나 입력해 주세요.";
    }
    if (!description.trim()) next.description = "내용을 입력해 주세요.";
    const isRealEstateSale = skinKey === "real-estate" && dealType === "판매";
    const effectiveFreeShare = isUsedCarSkin ? false : isFreeShare;
    if (hasPrice && !effectiveFreeShare && (skinKey !== "real-estate" || isRealEstateSale)) {
      const priceNum = price.trim() ? Number(price.replace(/,/g, "")) : NaN;
      if (!price.trim() || isNaN(priceNum) || priceNum < 0) next.price = isRealEstateSale ? "판매가를 입력해 주세요." : "가격을 입력해 주세요.";
    }
    if (hasLocation && (!region || !city))
      next.location =
        "거래 지역을 읽지 못했습니다. 주소 관리에서 대표 주소를 저장한 뒤 다시 시도해 주세요.";
    if (hasLocation && !tradeMeetSpot?.displayLine?.trim()) {
      const fallbackLine =
        representativeTradeMeetFallbackLine?.trim() || getLocationLabelIfValid(region, city)?.trim();
      if (!fallbackLine) {
        next.meetSpot = "거래 지역을 확인할 수 없습니다. 주소 관리에서 지역을 저장한 뒤 다시 시도해 주세요.";
      }
    }
    if (skinKey === "real-estate") {
      if (!buildingName.trim()) next.buildingName = "건물명을 입력해 주세요.";
      if (!estateType.trim()) next.estateType = "타입을 선택해 주세요.";
      if (dealType === "임대") {
        if (!deposit.replace(/,/g, "").trim()) next.deposit = "보증금을 입력해 주세요.";
        if (!monthly.replace(/,/g, "").trim()) next.monthly = "월세를 입력해 주세요.";
      }
      if (!areaSqm.trim()) next.areaSqm = "크기(sq)를 입력해 주세요.";
      if (!roomCount.trim()) next.roomCount = "방수를 입력해 주세요.";
      if (!bathroomCount.trim()) next.bathroomCount = "욕실수를 입력해 주세요.";
      if (!moveInDate.trim()) next.moveInDate = "입주 가능일을 선택해 주세요.";
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
    carYear,
    carModel,
    mileage,
    region,
    city,
    skinKey,
    dealType,
    buildingName,
    estateType,
    deposit,
    monthly,
    areaSqm,
    roomCount,
    bathroomCount,
    moveInDate,
    tradeMeetSpot,
    representativeTradeMeetFallbackLine,
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        if (
          !(await ensureClientAccessOrRedirectAsync(
            router,
            pathname || (editPostId ? `/products/${editPostId}/edit` : `/write/${category.slug}`)
          ))
        ) {
          return;
        }
        const user = getCurrentUser();
        const files = images.map((item) => item.file).filter((f): f is File => !!f);
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
          const [uploaded, preflightUserId, phoneGate] = await Promise.all([
            uploadPromise,
            getCurrentUserIdForDb(),
            assertPhoneAllowsPostWrite(),
          ]);
          uploadedFileResults = uploaded;
          if (!phoneGate.ok) {
            const next =
              pathname || (editPostId ? `/products/${editPostId}/edit` : `/write/${category.slug}`);
            if (redirectForBlockedAction(router, phoneGate.error, next)) return;
            setErrors({ submit: phoneGate.error });
            return;
          }
          if (!preflightUserId) {
            setErrors({ submit: "로그인이 필요합니다." });
            return;
          }
          createPreflight = { userId: preflightUserId, phoneGatePassed: true };
          mergedImageUrls = [...existingUrls, ...uploadedFileResults];
        }
        if (files.length > 0 && uploadedFileResults.length !== files.length) {
          setErrors({
            submit: `이미지 ${files.length}장 중 ${uploadedFileResults.length}장만 업로드되었습니다. 네트워크·저장소 설정을 확인한 뒤 다시 시도해 주세요.`,
          });
          return;
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
        const derivedNeighborhood =
          skinKey === "real-estate"
            ? REGIONS.find((r) => r.id === region)?.cities.find((c) => c.id === city)?.name ?? ""
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
          carHasAccident,
          salary,
          workPlace,
          workType,
          currency,
          exchangeRate,
        });
        if (isDirectDeal && !isUsedCarSkin) meta = { ...meta, direct_deal: true };
        meta = { ...meta, trade_chat_call_policy: tradeChatCallPolicy };
        if (hasLocation) {
          const lineFromMap = tradeMeetSpot?.displayLine?.trim();
          const lineFallback =
            representativeTradeMeetFallbackLine?.trim() || getLocationLabelIfValid(region, city)?.trim() || "";
          const line = lineFromMap || lineFallback;
          if (line) {
            const pin = pickPersistableMeetSpotCoords(tradeMeetSpot);
            meta = {
              ...meta,
              trade_meet_spot: {
                display_line: line,
                ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
                ...(tradeMeetSpot?.placeId ? { place_id: tradeMeetSpot.placeId } : {}),
              },
            };
          }
        }
        const usedCarPostTitle =
          usedCarTrade === "buy"
            ? `삽니다${carModel.trim() ? ` · ${carModel.trim()}` : ""}`
            : usedCarTrade === "sell"
              ? `팝니다${carModel.trim() ? ` · ${carModel.trim()}` : ""}`
              : "";
        const postTitle =
          skinKey === "real-estate"
            ? getLocationLabel(region, city) + (buildingName.trim() ? " " + buildingName.trim() : "")
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
          region: region || undefined,
          city: city || undefined,
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
      carHasAccident,
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
      tradeMeetSpot,
      representativeTradeMeetFallbackLine,
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
      setTradeMeetSpot(next);
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
  }, [pathname, tradeWriteSheetEpoch, category.id]);

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
      if (next) setTradeMeetSpot(next);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const backHref = editPostId ? `/post/${editPostId}` : getCategoryHref(category);

  const tradeWriteHeaderTitle = useMemo(() => {
    if (editPostId) return `${category.name} · 수정`;
    if (region && city && hasLocation) {
      return `${getLocationLabel(region, city)}에 올리기`;
    }
    return `${category.name} · 글쓰기`;
  }, [editPostId, category.name, region, city, hasLocation]);

  /** 지도 미선택 시 — 대표 주소 `buildTradePublicLine` 우선, 없으면 거래 지역 라벨 */
  const karrotMeetSpotDisplayLine = useMemo(() => {
    const fromMap = tradeMeetSpot?.displayLine?.trim();
    if (fromMap) return fromMap;
    const rep = representativeTradeMeetFallbackLine?.trim();
    if (rep) return rep;
    if (hasLocation) {
      return getLocationLabelIfValid(region, city)?.trim() ?? "";
    }
    return "";
  }, [tradeMeetSpot, representativeTradeMeetFallbackLine, hasLocation, region, city]);

  const tradeLocationEl = hasLocation ? (
      <div id={TRADE_MEET_SPOT_SCROLL_ANCHOR_ID} className={coreLocked ? "pointer-events-none opacity-60" : ""}>
        <TradeDefaultLocationBlock
          editPostId={editPostId}
          region={region}
          city={city}
          onSyncRegionCity={syncTradeRegionCity}
          error={errors.location}
          readOnly={coreLocked}
          onBeforeNavigateToAddresses={
            !editPostId ? handleBeforeNavigateToAddresses : undefined
          }
          karrotMeetSpotUi={hasLocation}
          meetSpotLine={karrotMeetSpotDisplayLine || null}
          meetSpotError={errors.meetSpot}
          onBeforeMeetSpotPick={
            hasLocation && !coreLocked ? () => void handleBeforeMeetSpotPick() : undefined
          }
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
        title="작성 중이던 글이 있습니다"
        description="이전에 입력한 내용을 불러올까요?"
        secondaryLabel="새로 작성"
        onSecondary={handleDiscardPersistedDraft}
        primaryLabel="이어쓰기"
        onPrimary={handleResumePersistedDraft}
        primaryTone="primary"
        zIndexClass="z-[72]"
        ariaLabel="임시 저장 글 복구"
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
      <form onSubmit={handleSubmit} className={APP_TRADE_WRITE_FORM_CLASS}>
        {tradePolicy?.hint ? (
          <div className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-3 py-1.5 sam-text-body-secondary text-sam-warning">
            {tradePolicy.hint}
          </div>
        ) : null}
        <ImageUploader
          value={images}
          onChange={setImages}
          maxCount={maxProductImages}
          label="사진"
          disabled={coreLocked}
          compact={false}
          variant="karrot"
        />
        <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
          <WriteTradeTopicSection
            category={category}
            value={tradeTopicChildId}
            onChange={setTradeTopicChildId}
            compact
          />
        </div>
        {skinKey === "real-estate" ? (
          <section className={`sam-section ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
            <div>
              <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                건물명 <span className="text-sam-danger">*</span>
              </label>
              <input
                type="text"
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                readOnly={coreLocked}
                className={`w-full ${PHILIFE_FB_INPUT_CLASS}`}
                placeholder="단지·건물명만 입력 (거래 지역은 대표 주소 기준)"
                aria-invalid={!!errors.buildingName}
              />
              {errors.buildingName && (
                <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.buildingName}</p>
              )}
            </div>
          </section>
        ) : skinKey === "used-car" ? (
          <section className={`sam-section ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
            <p className="mb-2 sam-text-body font-medium text-sam-fg">
              구분 <span className="text-sam-danger">*</span>
            </p>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={usedCarTrade === "sell"}
                  onChange={(e) => setUsedCarTrade(e.target.checked ? "sell" : null)}
                  className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
                />
                <span className="sam-text-body text-sam-fg">팝니다</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={usedCarTrade === "buy"}
                  onChange={(e) => setUsedCarTrade(e.target.checked ? "buy" : null)}
                  className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
                />
                <span className="sam-text-body text-sam-fg">삽니다</span>
              </label>
            </div>
            {(errors.usedCarTrade || errors.title) && (
              <p className="mt-2 sam-text-body-secondary text-sam-danger">{errors.usedCarTrade || errors.title}</p>
            )}
          </section>
        ) : (
          <section
            className={`${isKarrotGeneral ? KARROT_SECTION : "sam-section"} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
          >
            <label
              className={`mb-1.5 block sam-text-body-lg font-semibold text-sam-fg ${isKarrotGeneral ? KARROT_LABEL : ""}`}
            >
              제목 <span className="text-sam-danger">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={coreLocked}
              placeholder={isKarrotGeneral ? "제목을 입력해주세요." : "글 제목"}
              maxLength={100}
              className={`w-full ${PHILIFE_FB_INPUT_CLASS} ${isKarrotGeneral ? `${KARROT_INNER_BOX} px-3 py-3 max-md:min-h-[48px]` : ""}`}
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.title}</p>}
          </section>
        )}
        <section className={KARROT_SECTION}>
          <label className={`mb-1.5 block sam-text-body font-semibold text-sam-fg ${KARROT_LABEL}`}>
            자세한 설명 <span className="text-sam-danger">*</span>
          </label>
          <AutoGrowTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={coreLocked || showDescriptionAppend}
            placeholder={
              "브랜드, 모델명, 구매 시기, 하자 여부 등 자세히 적어주세요.\n안전거래를 위해 공유하지 말아야 할 개인정보는 적지 마세요."
            }
            className={`w-full ${PHILIFE_FB_TEXTAREA_CLASS} py-2.5 ${KARROT_INNER_BOX} min-h-[140px] px-3`}
            aria-invalid={!!errors.description}
          />
          {!showDescriptionAppend ? (
            <>
              <button
                type="button"
                className="mt-1.5 rounded-ui-rect border border-sam-border bg-sam-surface-muted px-2 py-1 text-[11px] leading-snug text-sam-fg"
                onClick={() => setFrequentPhrasesOpen(true)}
              >
                자주 쓰는 문구
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
          {errors.description && (
            <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.description}</p>
          )}
          {showDescriptionAppend ? (
            <div className="mt-3">
              <label className="mb-1 block sam-text-body-secondary text-sam-fg">추가 안내 (선택)</label>
              <AutoGrowTextarea
                value={descriptionAppend}
                onChange={(e) => setDescriptionAppend(e.target.value)}
                placeholder="협의·진행 중 추가로 안내할 내용만 입력해 주세요."
                className={`w-full ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[84px] py-2.5`}
              />
            </div>
          ) : null}
        </section>
        {(hasPrice || (hasFreeShare && !isUsedCarSkin)) &&
          skinKey !== "real-estate" &&
          !(isUsedCarSkin && usedCarTrade === "buy") && (
          <section className={isKarrotGeneral ? KARROT_SECTION : "sam-section"}>
            {((hasFreeShare && !isUsedCarSkin) || (hasDirectDeal && !isUsedCarSkin)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {hasFreeShare && hasDirectDeal && !isUsedCarSkin ? (
                  isKarrotGeneral ? (
                    <div role="radiogroup" aria-label="거래 방식" className="flex w-full gap-2">
                      <button
                        type="button"
                        className={`flex-1 rounded-full border px-4 py-2.5 sam-text-body font-medium transition ${!isFreeShare ? KARROT_PILL_ACTIVE : KARROT_PILL_IDLE}`}
                        onClick={() => {
                          setIsFreeShare(false);
                          setIsDirectDeal(true);
                        }}
                      >
                        판매하기
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-full border px-4 py-2.5 sam-text-body font-medium transition ${isFreeShare ? KARROT_PILL_ACTIVE : KARROT_PILL_IDLE}`}
                        onClick={() => {
                          setIsFreeShare(true);
                          setIsDirectDeal(false);
                        }}
                      >
                        나눔하기
                      </button>
                    </div>
                  ) : (
                  <div role="radiogroup" aria-label="거래 방식" className="flex flex-wrap gap-x-5 gap-y-2">
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
                      <span className="sam-text-body text-sam-fg">직거래</span>
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
                      <span className="sam-text-body text-sam-fg">나눔</span>
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
                        <span className="sam-text-body text-sam-fg">나눔</span>
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
                        <span className="sam-text-body text-sam-fg">직거래</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
            {hasPrice && (!isFreeShare || isUsedCarSkin) && (
              <>
                <label
                  className={`mb-2 block sam-text-body font-medium text-sam-fg ${isKarrotGeneral ? KARROT_LABEL : ""} ${!isUsedCarSkin && (hasFreeShare || hasDirectDeal) ? "mt-2" : ""}`}
                >
                  가격 <span className="text-sam-danger">*</span>
                </label>
                <div
                  className={`flex items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 focus-within:ring-2 focus-within:ring-signature/20 ${isKarrotGeneral ? `${KARROT_INNER_BOX} py-3` : ""}`}
                >
                  <span className="shrink-0 sam-text-body font-medium text-sam-muted">
                    {getCurrencyUnitLabel(appSettings.defaultCurrency)}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                    placeholder="가격을 입력해주세요."
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body text-sam-fg outline-none placeholder:text-sam-meta"
                    aria-invalid={!!errors.price}
                  />
                </div>
                {errors.price && (
                  <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.price}</p>
                )}
                {allowPriceOffer && (
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPriceOfferEnabled}
                      onChange={(e) => setIsPriceOfferEnabled(e.target.checked)}
                      className={`rounded border-sam-border ${isKarrotGeneral ? "accent-signature" : ""}`}
                    />
                    <span className="sam-text-body-secondary text-sam-muted">가격 제안 받기</span>
                  </label>
                )}
              </>
            )}
          </section>
        )}
        {skinKey === "real-estate" && (
          <section className="sam-section">
            <h4 className="mb-2 sam-text-body-secondary font-medium text-sam-muted">부동산 정보</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                    타입 <span className="text-sam-danger">*</span>
                  </label>
                  <select
                    value={estateType}
                    onChange={(e) => setEstateType(e.target.value)}
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                    aria-invalid={!!errors.estateType}
                  >
                    {REAL_ESTATE_TYPES.map((opt) => (
                      <option key={opt.value || "empty"} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.estateType && (
                    <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.estateType}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                    거래유형 <span className="text-sam-danger">*</span>
                  </label>
                  <select
                    value={dealType}
                    onChange={(e) => setDealType(e.target.value as "임대" | "판매")}
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                  >
                    {REAL_ESTATE_DEAL_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {dealType === "판매" && (
                <div>
                  <label className="mb-1 block sam-text-body-secondary text-sam-fg">판매가 <span className="text-sam-danger">*</span></label>
                  <div className="flex items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 focus-within:ring-2 focus-within:ring-signature/20">
                    <span className="shrink-0 sam-text-body font-medium text-sam-muted">
                      {currencyUnit}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                      placeholder="판매가 입력"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body text-sam-fg outline-none placeholder:text-sam-meta"
                      aria-invalid={!!errors.price}
                    />
                  </div>
                  {errors.price && <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.price}</p>}
                </div>
              )}
              {dealType === "임대" && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                        보증금 <span className="text-sam-danger">*</span>
                      </label>
                      <div className="flex items-center gap-1 rounded-ui-rect border border-sam-border px-2 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={deposit}
                          onChange={(e) => setDeposit(formatPriceInput(e.target.value))}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none"
                          aria-invalid={!!errors.deposit}
                        />
                        <span className="shrink-0 sam-text-xxs text-sam-muted sm:sam-text-helper">{currencyUnit}</span>
                      </div>
                      {errors.deposit && (
                        <p className="mt-1 sam-text-helper text-sam-danger">{errors.deposit}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                        월세 <span className="text-sam-danger">*</span>
                      </label>
                      <div className="flex items-center gap-1 rounded-ui-rect border border-sam-border px-2 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={monthly}
                          onChange={(e) => setMonthly(formatPriceInput(e.target.value))}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none"
                          aria-invalid={!!errors.monthly}
                        />
                        <span className="shrink-0 sam-text-xxs text-sam-muted sm:sam-text-xxs">{perMonthSuffix}</span>
                      </div>
                      {errors.monthly && (
                        <p className="mt-1 sam-text-helper text-sam-danger">{errors.monthly}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block sam-text-body-secondary text-sam-fg">관리비 (선택)</label>
                      <div className="flex items-center gap-1 rounded-ui-rect border border-sam-border px-2 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={managementFee}
                          onChange={(e) => setManagementFee(formatPriceInput(e.target.value))}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none"
                        />
                        <span className="shrink-0 sam-text-xxs text-sam-muted sm:sam-text-xxs">{perMonthSuffix}</span>
                      </div>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={hasPremium}
                      onChange={(e) => setHasPremium(e.target.checked)}
                      className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
                    />
                    <span className="sam-text-body-secondary text-sam-fg">권리금 있음 (선택)</span>
                  </label>
                </>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                    크기(sq) <span className="text-sam-danger">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={areaSqm}
                    onChange={(e) => setAreaSqm(e.target.value)}
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                    aria-invalid={!!errors.areaSqm}
                  />
                  {errors.areaSqm && (
                    <p className="mt-1 sam-text-helper text-sam-danger">{errors.areaSqm}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                    방수 <span className="text-sam-danger">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={roomCount}
                    onChange={(e) => setRoomCount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                    aria-invalid={!!errors.roomCount}
                  />
                  {errors.roomCount && (
                    <p className="mt-1 sam-text-helper text-sam-danger">{errors.roomCount}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                    욕실수 <span className="text-sam-danger">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bathroomCount}
                    onChange={(e) => setBathroomCount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                    aria-invalid={!!errors.bathroomCount}
                  />
                  {errors.bathroomCount && (
                    <p className="mt-1 sam-text-helper text-sam-danger">{errors.bathroomCount}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block sam-text-body-secondary text-sam-fg">
                  입주 가능일 <span className="text-sam-danger">*</span>
                </label>
                <select
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                  aria-invalid={!!errors.moveInDate}
                >
                  {MOVE_IN_OPTIONS.map((opt) => (
                    <option key={opt.value || "empty"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.moveInDate && (
                  <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.moveInDate}</p>
                )}
              </div>
            </div>
          </section>
        )}
        {skinKey === "used-car" && (
          <section className="sam-section">
            <h4 className="mb-2 sam-text-body-secondary font-medium text-sam-muted">차량 정보</h4>
            {usedCarTrade === "buy" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-body-secondary text-sam-fg">차종</label>
                    <input
                      type="text"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="예: 소나타"
                      className="w-full rounded-ui-rect border border-sam-border px-2 py-2 sam-text-body"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper leading-tight text-sam-fg sm:sam-text-body-secondary">
                      년식 (이하) <span className="text-sam-danger">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={carYear}
                      onChange={(e) => setCarYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder={`${USED_CAR_FORM_YEAR_MIN}~${getUsedCarFormYearMax()}`}
                      className="w-full rounded-ui-rect border border-sam-border px-2 py-2 sam-text-body"
                      aria-invalid={!!errors.carYear}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper leading-tight text-sam-fg sm:sam-text-body-secondary">
                      금액 (이하) <span className="text-sam-danger">*</span>
                    </label>
                    <div className="flex items-center gap-1 rounded-ui-rect border border-sam-border px-2 py-2 focus-within:ring-2 focus-within:ring-signature/20">
                      <span className="shrink-0 sam-text-helper font-medium text-sam-muted">
                        {getCurrencyUnitLabel(appSettings.defaultCurrency)}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={price}
                        onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                        placeholder="0"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none"
                        aria-invalid={!!errors.price}
                      />
                    </div>
                  </div>
                </div>
                {(errors.price || errors.carYear) && (
                  <p className="mt-2 sam-text-body-secondary text-sam-danger">{errors.price || errors.carYear}</p>
                )}
                {allowPriceOffer && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPriceOfferEnabled}
                      onChange={(e) => setIsPriceOfferEnabled(e.target.checked)}
                      className="rounded border-sam-border"
                    />
                    <span className="sam-text-body-secondary text-sam-muted">가격 제안받기</span>
                  </label>
                )}
              </>
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
                  <span className="sam-text-body-secondary text-sam-fg whitespace-nowrap">사고 이력 있음</span>
                </label>
              </div>
            )}
          </section>
        )}
        {skinKey === "jobs" && (
          <section className="sam-section">
            <h4 className="mb-2 sam-text-body-secondary font-medium text-sam-muted">알바 정보</h4>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block sam-text-body-secondary text-sam-fg">급여</label>
                <input
                  type="text"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="예: 시급 ₱150"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                />
              </div>
              <div>
                <label className="mb-1 block sam-text-body-secondary text-sam-fg">근무지</label>
                <input
                  type="text"
                  value={workPlace}
                  onChange={(e) => setWorkPlace(e.target.value)}
                  placeholder="예: 강남구"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                />
              </div>
              <div>
                <label className="mb-1 block sam-text-body-secondary text-sam-fg">근무 형태</label>
                <input
                  type="text"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  placeholder="예: 단기/장기"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                />
              </div>
            </div>
          </section>
        )}
        {skinKey === "exchange" && (
          <section className="sam-section">
            <h4 className="mb-2 sam-text-body-secondary font-medium text-sam-muted">환전 정보</h4>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block sam-text-body-secondary text-sam-fg">통화</label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="예: USD, PHP"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                />
              </div>
              <div>
                <label className="mb-1 block sam-text-body-secondary text-sam-fg">환율/비고</label>
                <input
                  type="text"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="예: ₱56 per USD"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                />
              </div>
            </div>
          </section>
        )}
        {tradeLocationEl}
        <section
          className={`sam-section ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
        >
          <h4 className="mb-1 sam-text-body-secondary font-medium text-sam-muted">거래 채팅 통화</h4>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trade_chat_call_policy"
                className="mt-0"
                checked={tradeChatCallPolicy === "none"}
                onChange={() => setTradeChatCallPolicy("none")}
              />
              <span className="sam-text-body font-medium text-sam-fg">받지 않음</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trade_chat_call_policy"
                className="mt-0"
                checked={tradeChatCallPolicy === "voice_only"}
                onChange={() => setTradeChatCallPolicy("voice_only")}
              />
              <span className="sam-text-body font-medium text-sam-fg">음성만</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trade_chat_call_policy"
                className="mt-0"
                checked={tradeChatCallPolicy === "voice_and_video"}
                onChange={() => setTradeChatCallPolicy("voice_and_video")}
              />
              <span className="sam-text-body font-medium text-sam-fg">음성 + 영상</span>
            </label>
          </div>
        </section>
        {errors.submit && (
          <p className="px-4 py-2 sam-text-body-secondary text-sam-danger">{errors.submit}</p>
        )}
        <SubmitButton
          label={editPostId ? "수정 완료" : "작성 완료"}
          submitting={submitting}
          submittingLabel={editPostId ? "저장 중…" : "등록 중…"}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}

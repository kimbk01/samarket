"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";

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
const USED_CAR_YEAR_MIN = 1990;

function getUsedCarYearMax(): number {
  return new Date().getFullYear();
}

function getUsedCarYearFieldError(raw: string, mode: "buy" | "sell"): string | null {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) {
    return mode === "buy" ? "년식 (이하)를 입력해 주세요." : "연식을 입력해 주세요.";
  }
  if (digits.length < 4) {
    return "연식은 네 자리 연도로 입력해 주세요.";
  }
  const y = parseInt(digits, 10);
  const max = getUsedCarYearMax();
  if (y < USED_CAR_YEAR_MIN || y > max) {
    return `연식은 ${USED_CAR_YEAR_MIN}년~${max}년 사이로 입력해 주세요.`;
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
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel, formatPriceInput } from "@/lib/utils/format";
import { REGIONS, getLocationLabel } from "@/lib/products/form-options";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "../useWriteScreenEmbeddedTier1";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { TradeDefaultLocationBlock } from "../shared/TradeDefaultLocationBlock";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";
import { consumeTradeWriteRestoreAfterAddressFlag, setTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import { PHILIFE_FB_INPUT_CLASS, PHILIFE_FB_TEXTAREA_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import {
  buildTradeWriteFormSessionDraft,
  clearTradeWriteFormSessionDraft,
  draftImagesToUploadItems,
  readTradeWriteFormSessionDraft,
  tradeWriteSessionDraftLooksFilled,
  writeTradeWriteFormSessionDraft,
  type TradeWriteFormSessionDraftBuildArgs,
} from "@/lib/posts/trade-write-form-session-draft";

interface TradeWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
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
  suppressTier1Chrome = false,
  editPostId,
  ownerEditSnapshot,
  tradePolicy = null,
}: TradeWriteFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const appSettings = useMemo(() => getAppSettings(), []);
  const currencyUnit = getCurrencyUnitLabel(appSettings.defaultCurrency);
  const perMonthSuffix = `${currencyUnit}/month`;
  const settings = category.settings;
  const hasPrice = settings?.has_price ?? true;
  const hasLocation = settings?.has_location ?? true;
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
  const [descriptionAppend, setDescriptionAppend] = useState("");
  /** 거래 채팅 통화(메신저) — 판매자만 설정, 구매자에게 음성/영상 버튼 노출 */
  const [tradeChatCallPolicy, setTradeChatCallPolicy] = useState<TradeChatCallPolicy>("none");
  const coreLocked = Boolean(editPostId && tradePolicy && !tradePolicy.allowEditCore);
  const showDescriptionAppend = Boolean(editPostId && tradePolicy?.allowAppendOnlyDescription);
  const skinKey = category.icon_key ?? "general";
  const isUsedCarSkin = skinKey === "used-car";

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
  /** 중고차: 삽니다(buy) / 팝니다(sell) */
  const [usedCarTrade, setUsedCarTrade] = useState<"buy" | "sell" | null>(null);
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

  /** 신규 작성: 카테고리 바뀔 때마다 직거래·나눔 기본값(직거래 우선) — 수정 모드는 스냅샷이 덮어씀 */
  useEffect(() => {
    if (editPostId) return;
    if (isUsedCarSkin) return;
    setIsFreeShare(false);
    setIsDirectDeal(true);
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

  const syncTradeRegionCity = useCallback((rid: string, cid: string) => {
    setRegion(rid);
    setCity(cid);
  }, []);

  const tradeDraftFlushRef = useRef<TradeWriteFormSessionDraftBuildArgs | null>(null);

  /** 신규: 주소 관리에서 돌아올 때만 초안 복원. 그 외 `/write` 진입은 초안 삭제 → 항상 빈 폼 시작. */
  useLayoutEffect(() => {
    if (editPostId) return;
    const shouldRestore = consumeTradeWriteRestoreAfterAddressFlag(category.id);
    if (shouldRestore) {
      const d = readTradeWriteFormSessionDraft(category.id);
      if (!d) return;
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
      setUsedCarTrade(d.usedCarTrade === "buy" || d.usedCarTrade === "sell" ? d.usedCarTrade : null);
      setCarHasAccident(d.carHasAccident === true);
      setSalary(d.salary ?? "");
      setWorkPlace(d.workPlace ?? "");
      setWorkType(d.workType ?? "");
      setCurrency(d.currency ?? "");
      setExchangeRate(d.exchangeRate ?? "");
      setTradeChatCallPolicy(normalizeTradeChatCallPolicy(d.tradeChatCallPolicy));
      setDescriptionAppend(d.descriptionAppend ?? "");
      return;
    }
    clearTradeWriteFormSessionDraft(category.id);
  }, [editPostId, category.id]);

  const sessionDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (editPostId) {
      tradeDraftFlushRef.current = null;
      return;
    }
    const flushPayload: TradeWriteFormSessionDraftBuildArgs = {
      categoryId: category.id,
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
    };
    tradeDraftFlushRef.current = flushPayload;
    if (!tradeWriteSessionDraftLooksFilled(flushPayload)) return;
    if (sessionDraftTimerRef.current) clearTimeout(sessionDraftTimerRef.current);
    sessionDraftTimerRef.current = setTimeout(() => {
      sessionDraftTimerRef.current = null;
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
  ]);

  useEffect(() => {
    return () => {
      if (editPostId) return;
      const snap = tradeDraftFlushRef.current;
      if (!snap) return;
      if (!tradeWriteSessionDraftLooksFilled(snap)) return;
      writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(snap));
    };
  }, [editPostId]);

  /**
   * 주소 관리로 이동 직전: 로컬 파일(미업로드)을 스토리지에 올려 URL로 바꾼 뒤 초안에 저장.
   * sessionStorage 초안은 http(s) URL만 보존하므로, 이 단계 없이 나가면 뒤로가기 후 이미지가 비어 보임.
   */
  const handleBeforeNavigateToAddresses = useCallback(async () => {
    if (editPostId) return;
    setTradeWriteRestoreAfterAddressFlag(category.id);

    const user = getCurrentUser();
    let workingImages = [...images];
    const files = workingImages.map((x) => x.file).filter((f): f is File => !!f);
    if (files.length > 0) {
      if (!user?.id) {
        window.alert("로그인이 필요합니다. 로그인 후 주소 관리로 이동해 주세요.");
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
    }

    const payload: TradeWriteFormSessionDraftBuildArgs = {
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
    };
    tradeDraftFlushRef.current = payload;
    if (tradeWriteSessionDraftLooksFilled(payload)) {
      writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(payload));
    }
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
  ]);

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
    setSalary(h.salary);
    setWorkPlace(h.workPlace);
    setWorkType(h.workType);
    setCurrency(h.currency);
    setExchangeRate(h.exchangeRate);
    setTradeChatCallPolicy(h.tradeChatCallPolicy);
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
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        const user = getCurrentUser();
        if (
          !ensureClientAccessOrRedirect(
            router,
            user,
            pathname || (editPostId ? `/products/${editPostId}/edit` : `/write/${category.slug}`)
          )
        ) {
          return;
        }
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
            clearTradeWriteFormSessionDraft(category.id);
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
    ]
  );

  const backHref = editPostId ? `/products/${editPostId}` : getCategoryHref(category);

  return (
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-sam-app pb-24"
          : "min-h-screen bg-sam-app pb-24"
      }
    >
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={editPostId ? `${category.name} · 수정` : `${category.name} · 글쓰기`}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[480px] space-y-3 px-4 py-4 md:max-w-2xl lg:max-w-3xl"
      >
        {tradePolicy?.hint ? (
          <div className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-warning">
            {tradePolicy.hint}
          </div>
        ) : null}
        <ImageUploader
          value={images}
          onChange={setImages}
          maxCount={maxProductImages}
          label="사진"
          disabled={coreLocked}
        />
        <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
          <WriteTradeTopicSection
            category={category}
            value={tradeTopicChildId}
            onChange={setTradeTopicChildId}
          />
        </div>
        {skinKey === "real-estate" ? (
          <>
            <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
              <TradeDefaultLocationBlock
                editPostId={editPostId}
                region={region}
                city={city}
                onSyncRegionCity={syncTradeRegionCity}
                error={errors.location}
                readOnly={coreLocked}
                onBeforeNavigateToAddresses={!editPostId ? handleBeforeNavigateToAddresses : undefined}
              />
            </div>
            <section
              className={`sam-section ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
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
          </>
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
          <section className={`sam-section ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
            <label className="mb-1.5 block sam-text-body-lg font-semibold text-sam-fg">
              제목 <span className="text-sam-danger">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={coreLocked}
              placeholder="글 제목"
              maxLength={100}
              className={`w-full ${PHILIFE_FB_INPUT_CLASS}`}
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.title}</p>}
          </section>
        )}
        <section className="sam-section">
          <label className="mb-1.5 block sam-text-body font-semibold text-sam-fg">
            내용 <span className="text-sam-danger">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={coreLocked || showDescriptionAppend}
            placeholder="내용을 입력해 주세요"
            rows={4}
            className={`w-full resize-none ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[96px] py-2.5`}
            aria-invalid={!!errors.description}
          />
          {errors.description && (
            <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.description}</p>
          )}
          {showDescriptionAppend ? (
            <div className="mt-3">
              <label className="mb-1 block sam-text-body-secondary text-sam-fg">추가 안내 (선택)</label>
              <textarea
                value={descriptionAppend}
                onChange={(e) => setDescriptionAppend(e.target.value)}
                placeholder="협의·진행 중 추가로 안내할 내용만 입력해 주세요."
                rows={3}
                className={`w-full resize-none ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[84px] py-2.5`}
              />
            </div>
          ) : null}
        </section>
        {(hasPrice || (hasFreeShare && !isUsedCarSkin)) &&
          skinKey !== "real-estate" &&
          !(isUsedCarSkin && usedCarTrade === "buy") && (
          <section className="sam-section">
            {((hasFreeShare && !isUsedCarSkin) || (hasDirectDeal && !isUsedCarSkin)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {hasFreeShare && hasDirectDeal && !isUsedCarSkin ? (
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
                  className={`mb-2 block sam-text-body font-medium text-sam-fg ${!isUsedCarSkin && (hasFreeShare || hasDirectDeal) ? "mt-2" : ""}`}
                >
                  가격 <span className="text-sam-danger">*</span>
                </label>
                <div className="flex items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 focus-within:ring-2 focus-within:ring-signature/20">
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
                      className="rounded border-sam-border"
                    />
                    <span className="sam-text-body-secondary text-sam-muted">가격 제안받기</span>
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
                      placeholder={`${USED_CAR_YEAR_MIN}~${getUsedCarYearMax()}`}
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
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">차종</label>
                    <input
                      type="text"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="예: 소나타"
                      className="h-11 w-full rounded-ui-rect border border-sam-border px-2 sam-text-body"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
                      연식 <span className="text-sam-danger">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={carYear}
                      onChange={(e) => setCarYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder={`${USED_CAR_YEAR_MIN}~${getUsedCarYearMax()}`}
                      className="h-11 w-full rounded-ui-rect border border-sam-border px-2 sam-text-body"
                      aria-invalid={!!errors.carYear}
                    />
                    {errors.carYear ? (
                      <p className="mt-1 sam-text-helper text-sam-danger">{errors.carYear}</p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
                      주행거리(km)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mileage}
                      onChange={(e) => setMileage(formatPriceInput(e.target.value))}
                      placeholder="50,000"
                      className="h-11 w-full rounded-ui-rect border border-sam-border px-2 sam-text-body"
                    />
                  </div>
                </div>
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
        {hasLocation && skinKey !== "real-estate" && (
          <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
            <TradeDefaultLocationBlock
              editPostId={editPostId}
              region={region}
              city={city}
              onSyncRegionCity={syncTradeRegionCity}
              error={errors.location}
              readOnly={coreLocked}
              onBeforeNavigateToAddresses={!editPostId ? handleBeforeNavigateToAddresses : undefined}
            />
          </div>
        )}
        {errors.submit && (
          <p className="px-4 py-2 sam-text-body-secondary text-sam-danger">{errors.submit}</p>
        )}
        <SubmitButton
          label={editPostId ? "수정 완료" : "등록하기"}
          submitting={submitting}
          submittingLabel={editPostId ? "저장 중…" : "등록 중…"}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}

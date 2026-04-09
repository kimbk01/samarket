"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useMemo } from "react";
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
      if (v.carYear.trim()) o.car_year = v.carYear.trim();
      if (v.mileage.trim()) o.mileage = v.mileage.trim();
      o.has_accident = v.carHasAccident === true;
    }
    if (v.carTrade === "buy" && v.carYear.trim()) o.car_year_max = v.carYear.trim();
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
import type { OwnerEditPostSnapshot } from "@/lib/posts/owner-edit-post-snapshot";
import { hydrateTradeWriteFormFromSnapshot } from "@/lib/posts/apply-owner-snapshot-to-trade-write-form";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel, formatPriceInput } from "@/lib/utils/format";
import { REGIONS, getLocationLabel } from "@/lib/products/form-options";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { LocationSelector } from "../shared/LocationSelector";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";

interface TradeWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  /** `/products/[id]/edit` — 기존 글 수정 */
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
}

export function TradeWriteForm({
  category,
  onSuccess,
  onCancel,
  editPostId,
  ownerEditSnapshot,
}: TradeWriteFormProps) {
  const router = useRouter();
  const pathname = usePathname();
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
  const [isDirectDeal, setIsDirectDeal] = useState(false);
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    setTradeTopicChildId("");
  }, [category.id]);

  useEffect(() => {
    if (editPostId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/address-defaults", { credentials: "include" });
        const j = (await res.json()) as {
          ok?: boolean;
          defaults?: { trade?: { appRegionId?: string | null; appCityId?: string | null } | null };
        };
        if (!res.ok || !j.ok || !j.defaults?.trade || cancelled) return;
        const t = j.defaults.trade;
        const rid = t.appRegionId?.trim() ?? "";
        const cid = t.appCityId?.trim() ?? "";
        if (!rid || !cid) return;
        setRegion((prev) => prev || rid);
        setCity((prev) => prev || cid);
      } catch {
        /* 미로그인·미마이그레이션 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editPostId]);

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
    setCarYear(h.carYear);
    setMileage(h.mileage);
    setUsedCarTrade(h.usedCarTrade);
    setCarHasAccident(h.carHasAccident);
    setSalary(h.salary);
    setWorkPlace(h.workPlace);
    setWorkType(h.workType);
    setCurrency(h.currency);
    setExchangeRate(h.exchangeRate);
  }, [editPostId, ownerEditSnapshot, skinKey]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (skinKey !== "real-estate" && !isUsedCarSkin && !title.trim()) next.title = "제목을 입력해 주세요.";
    if (isUsedCarSkin && !usedCarTrade) next.usedCarTrade = "삽니다 또는 팝니다를 선택해 주세요.";
    if (isUsedCarSkin && usedCarTrade === "buy" && !carYear.trim()) {
      next.carYearBuy = "년식 (이하)를 입력해 주세요.";
    }
    if (!description.trim()) next.description = "내용을 입력해 주세요.";
    const isRealEstateSale = skinKey === "real-estate" && dealType === "판매";
    const effectiveFreeShare = isUsedCarSkin ? false : isFreeShare;
    if (hasPrice && !effectiveFreeShare && (skinKey !== "real-estate" || isRealEstateSale)) {
      const priceNum = price.trim() ? Number(price.replace(/,/g, "")) : NaN;
      if (!price.trim() || isNaN(priceNum) || priceNum < 0) next.price = isRealEstateSale ? "판매가를 입력해 주세요." : "가격을 입력해 주세요.";
    }
    if (skinKey === "real-estate" && (!region || !city))
      next.location = "지역과 동네를 선택해 주세요.";
    else if (hasLocation && (!region || !city))
      next.location = "지역과 동네를 선택해 주세요.";
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
        const uploaded =
          files.length > 0 && user?.id ? await uploadPostImages(files, user.id) : [];
        const mergedImageUrls = [...existingUrls, ...uploaded];
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
          meta: Object.keys(meta).length > 0 ? meta : undefined,
        };
        if (editPostId) {
          const res = await updateTradePostFromCreatePayload(editPostId, payload);
          if (res.ok) {
            onSuccess(editPostId);
          } else {
            if (redirectForBlockedAction(router, res.error, pathname || `/products/${editPostId}/edit`)) {
              return;
            }
            setErrors({ submit: res.error });
          }
        } else {
          const res = await createPost(payload);
          if (res.ok) {
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
    ]
  );

  const backHref = editPostId ? `/products/${editPostId}` : getCategoryHref(category);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <WriteScreenTier1Sync
        title={editPostId ? `${category.name} · 수정` : `${category.name} · 글쓰기`}
        backHref={backHref}
      />
      <form onSubmit={handleSubmit} className="mx-auto max-w-[480px]">
        <ImageUploader
          value={images}
          onChange={setImages}
          maxCount={maxProductImages}
          label="사진"
        />
        <WriteTradeTopicSection
          category={category}
          value={tradeTopicChildId}
          onChange={setTradeTopicChildId}
        />
        {skinKey === "real-estate" ? (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <div className="space-y-3">
              <LocationSelector
                embedded
                region={region}
                city={city}
                onRegionChange={(id) => {
                  setRegion(id);
                  setCity("");
                }}
                onCityChange={setCity}
                error={errors.location}
                label="지역 · 동네"
              />
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">
                  건물명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
                  placeholder="단지·건물명만 입력 (지역은 위에서 선택)"
                  aria-invalid={!!errors.buildingName}
                />
                {errors.buildingName && (
                  <p className="mt-1 text-[13px] text-red-500">{errors.buildingName}</p>
                )}
              </div>
            </div>
          </section>
        ) : skinKey === "used-car" ? (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <p className="mb-2 text-[14px] font-medium text-gray-800">
              구분 <span className="text-red-500">*</span>
            </p>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={usedCarTrade === "sell"}
                  onChange={(e) => setUsedCarTrade(e.target.checked ? "sell" : null)}
                  className="h-4 w-4 rounded border-gray-300 text-signature focus:ring-signature/30"
                />
                <span className="text-[15px] text-gray-800">팝니다</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={usedCarTrade === "buy"}
                  onChange={(e) => setUsedCarTrade(e.target.checked ? "buy" : null)}
                  className="h-4 w-4 rounded border-gray-300 text-signature focus:ring-signature/30"
                />
                <span className="text-[15px] text-gray-800">삽니다</span>
              </label>
            </div>
            {(errors.usedCarTrade || errors.title) && (
              <p className="mt-2 text-[13px] text-red-500">{errors.usedCarTrade || errors.title}</p>
            )}
          </section>
        ) : (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <label className="mb-2 block text-[14px] font-medium text-gray-800">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="글 제목"
              maxLength={100}
              className="w-full rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="mt-1 text-[13px] text-red-500">{errors.title}</p>}
          </section>
        )}
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <label className="mb-2 block text-[14px] font-medium text-gray-800">
            내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="내용을 입력해 주세요"
            rows={5}
            className="w-full resize-none rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
            aria-invalid={!!errors.description}
          />
          {errors.description && (
            <p className="mt-1 text-[13px] text-red-500">{errors.description}</p>
          )}
        </section>
        {(hasPrice || (hasFreeShare && !isUsedCarSkin)) &&
          skinKey !== "real-estate" &&
          !(isUsedCarSkin && usedCarTrade === "buy") && (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            {((hasFreeShare && !isUsedCarSkin) || (hasDirectDeal && !isUsedCarSkin)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {hasFreeShare && !isUsedCarSkin && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isFreeShare}
                      onChange={(e) => setIsFreeShare(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-[14px] text-gray-700">나눔</span>
                  </label>
                )}
                {hasDirectDeal && !isUsedCarSkin && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isDirectDeal}
                      onChange={(e) => setIsDirectDeal(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-[14px] text-gray-700">직거래</span>
                  </label>
                )}
              </div>
            )}
            {hasPrice && (!isFreeShare || isUsedCarSkin) && (
              <>
                <label
                  className={`mb-2 block text-[14px] font-medium text-gray-800 ${!isUsedCarSkin && (hasFreeShare || hasDirectDeal) ? "mt-2" : ""}`}
                >
                  가격 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 rounded-ui-rect border border-gray-300 bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-signature/20">
                  <span className="shrink-0 text-[15px] font-medium text-gray-600">
                    {getCurrencyUnitLabel(appSettings.defaultCurrency)}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                    placeholder="가격을 입력해주세요."
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
                    aria-invalid={!!errors.price}
                  />
                </div>
                {errors.price && (
                  <p className="mt-1 text-[13px] text-red-500">{errors.price}</p>
                )}
                {allowPriceOffer && (
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPriceOfferEnabled}
                      onChange={(e) => setIsPriceOfferEnabled(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-[13px] text-gray-600">가격 제안받기</span>
                  </label>
                )}
              </>
            )}
          </section>
        )}
        {skinKey === "real-estate" && (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <h4 className="mb-3 text-[13px] font-medium text-gray-600">부동산 정보</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-gray-700">
                    타입 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={estateType}
                    onChange={(e) => setEstateType(e.target.value)}
                    className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                    aria-invalid={!!errors.estateType}
                  >
                    {REAL_ESTATE_TYPES.map((opt) => (
                      <option key={opt.value || "empty"} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.estateType && (
                    <p className="mt-1 text-[13px] text-red-500">{errors.estateType}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-gray-700">
                    거래유형 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dealType}
                    onChange={(e) => setDealType(e.target.value as "임대" | "판매")}
                    className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                  >
                    {REAL_ESTATE_DEAL_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {dealType === "판매" && (
                <div>
                  <label className="mb-1 block text-[13px] text-gray-700">판매가 <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-2 rounded-ui-rect border border-gray-300 bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-signature/20">
                    <span className="shrink-0 text-[15px] font-medium text-gray-600">
                      {currencyUnit}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                      placeholder="판매가 입력"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
                      aria-invalid={!!errors.price}
                    />
                  </div>
                  {errors.price && <p className="mt-1 text-[13px] text-red-500">{errors.price}</p>}
                </div>
              )}
              {dealType === "임대" && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-[13px] text-gray-700">
                        보증금 <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1 rounded-ui-rect border border-gray-300 px-2 py-2.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={deposit}
                          onChange={(e) => setDeposit(formatPriceInput(e.target.value))}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] outline-none"
                          aria-invalid={!!errors.deposit}
                        />
                        <span className="shrink-0 text-[11px] text-gray-500 sm:text-[12px]">{currencyUnit}</span>
                      </div>
                      {errors.deposit && (
                        <p className="mt-1 text-[12px] text-red-500">{errors.deposit}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-[13px] text-gray-700">
                        월세 <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1 rounded-ui-rect border border-gray-300 px-2 py-2.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={monthly}
                          onChange={(e) => setMonthly(formatPriceInput(e.target.value))}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] outline-none"
                          aria-invalid={!!errors.monthly}
                        />
                        <span className="shrink-0 text-[10px] text-gray-500 sm:text-[11px]">{perMonthSuffix}</span>
                      </div>
                      {errors.monthly && (
                        <p className="mt-1 text-[12px] text-red-500">{errors.monthly}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-[13px] text-gray-700">관리비 (선택)</label>
                      <div className="flex items-center gap-1 rounded-ui-rect border border-gray-300 px-2 py-2.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={managementFee}
                          onChange={(e) => setManagementFee(formatPriceInput(e.target.value))}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] outline-none"
                        />
                        <span className="shrink-0 text-[10px] text-gray-500 sm:text-[11px]">{perMonthSuffix}</span>
                      </div>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={hasPremium}
                      onChange={(e) => setHasPremium(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-signature focus:ring-signature/30"
                    />
                    <span className="text-[13px] text-gray-800">권리금 있음 (선택)</span>
                  </label>
                </>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-gray-700">
                    크기(sq) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={areaSqm}
                    onChange={(e) => setAreaSqm(e.target.value)}
                    className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                    aria-invalid={!!errors.areaSqm}
                  />
                  {errors.areaSqm && (
                    <p className="mt-1 text-[12px] text-red-500">{errors.areaSqm}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-gray-700">
                    방수 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={roomCount}
                    onChange={(e) => setRoomCount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                    aria-invalid={!!errors.roomCount}
                  />
                  {errors.roomCount && (
                    <p className="mt-1 text-[12px] text-red-500">{errors.roomCount}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-gray-700">
                    욕실수 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bathroomCount}
                    onChange={(e) => setBathroomCount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                    aria-invalid={!!errors.bathroomCount}
                  />
                  {errors.bathroomCount && (
                    <p className="mt-1 text-[12px] text-red-500">{errors.bathroomCount}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">
                  입주 가능일 <span className="text-red-500">*</span>
                </label>
                <select
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                  aria-invalid={!!errors.moveInDate}
                >
                  {MOVE_IN_OPTIONS.map((opt) => (
                    <option key={opt.value || "empty"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.moveInDate && (
                  <p className="mt-1 text-[13px] text-red-500">{errors.moveInDate}</p>
                )}
              </div>
            </div>
          </section>
        )}
        {skinKey === "used-car" && (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <h4 className="mb-3 text-[13px] font-medium text-gray-600">차량 정보</h4>
            {usedCarTrade === "buy" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label className="mb-1 block text-[13px] text-gray-700">차종</label>
                    <input
                      type="text"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="예: 소나타"
                      className="w-full rounded-ui-rect border border-gray-300 px-2 py-2 text-[14px]"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-[12px] leading-tight text-gray-700 sm:text-[13px]">
                      년식 (이하) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={carYear}
                      onChange={(e) => setCarYear(e.target.value)}
                      placeholder="2020"
                      className="w-full rounded-ui-rect border border-gray-300 px-2 py-2 text-[14px]"
                      aria-invalid={!!errors.carYearBuy}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-[12px] leading-tight text-gray-700 sm:text-[13px]">
                      금액 (이하) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-1 rounded-ui-rect border border-gray-300 px-2 py-2 focus-within:ring-2 focus-within:ring-signature/20">
                      <span className="shrink-0 text-[12px] font-medium text-gray-600">
                        {getCurrencyUnitLabel(appSettings.defaultCurrency)}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={price}
                        onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                        placeholder="0"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] outline-none"
                        aria-invalid={!!errors.price}
                      />
                    </div>
                  </div>
                </div>
                {(errors.price || errors.carYearBuy) && (
                  <p className="mt-2 text-[13px] text-red-500">{errors.price || errors.carYearBuy}</p>
                )}
                {allowPriceOffer && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPriceOfferEnabled}
                      onChange={(e) => setIsPriceOfferEnabled(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-[13px] text-gray-600">가격 제안받기</span>
                  </label>
                )}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0 flex flex-col gap-2">
                  <div>
                    <label className="mb-1 block text-[13px] text-gray-700">차종</label>
                    <input
                      type="text"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="예: 소나타"
                      className="w-full rounded-ui-rect border border-gray-300 px-2 py-2 text-[14px]"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      checked={carHasAccident}
                      onChange={(e) => setCarHasAccident(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-signature focus:ring-signature/30"
                    />
                    <span className="text-[13px] text-gray-800">사고 이력 있음</span>
                  </label>
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-gray-700">연식</label>
                  <input
                    type="text"
                    value={carYear}
                    onChange={(e) => setCarYear(e.target.value)}
                    placeholder="2020"
                    className="w-full rounded-ui-rect border border-gray-300 px-2 py-2 text-[14px]"
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[12px] leading-tight text-gray-700 sm:text-[13px]">
                    주행거리(km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value.replace(/[^0-9,]/g, ""))}
                    placeholder="50000"
                    className="w-full rounded-ui-rect border border-gray-300 px-2 py-2 text-[14px]"
                  />
                </div>
              </div>
            )}
          </section>
        )}
        {skinKey === "jobs" && (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <h4 className="mb-3 text-[13px] font-medium text-gray-600">알바 정보</h4>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">급여</label>
                <input
                  type="text"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="예: 시급 ₱150"
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">근무지</label>
                <input
                  type="text"
                  value={workPlace}
                  onChange={(e) => setWorkPlace(e.target.value)}
                  placeholder="예: 강남구"
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">근무 형태</label>
                <input
                  type="text"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  placeholder="예: 단기/장기"
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                />
              </div>
            </div>
          </section>
        )}
        {skinKey === "exchange" && (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <h4 className="mb-3 text-[13px] font-medium text-gray-600">환전 정보</h4>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">통화</label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="예: USD, PHP"
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] text-gray-700">환율/비고</label>
                <input
                  type="text"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="예: ₱56 per USD"
                  className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
                />
              </div>
            </div>
          </section>
        )}
        {hasLocation && skinKey !== "real-estate" && (
          <LocationSelector
            region={region}
            city={city}
            onRegionChange={setRegion}
            onCityChange={setCity}
            error={errors.location}
          />
        )}
        {errors.submit && (
          <p className="px-4 py-2 text-[13px] text-red-500">{errors.submit}</p>
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

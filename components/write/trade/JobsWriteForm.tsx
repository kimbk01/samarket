"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice, formatPriceInput, getCurrencyUnitLabel } from "@/lib/utils/format";
import {
  JOB_LISTING_KIND_OPTIONS,
  type JobListingKind,
  JOB_WORK_TYPE_OPTIONS,
  PAY_TYPE_OPTIONS,
  WORK_CATEGORY_OPTIONS,
  WORK_CATEGORY_OTHER,
  WORK_CATEGORY_OTHER_MAX,
  EXPERIENCE_LEVEL_OPTIONS,
  JOB_TITLE_MIN,
  JOB_TITLE_MAX,
  JOB_DESCRIPTION_MAX,
  MIN_WAGE_2026,
  MIN_WAGE_PHP_HOURLY,
} from "@/lib/jobs/form-options";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { WriteHeader } from "../WriteHeader";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";
import { LocationSelector } from "../shared/LocationSelector";

interface JobsWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
}

/** 로컬 기준 YYYY-MM-DD */
function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampDateNotBefore(value: string, min: string): string {
  if (!value) return "";
  if (min && value < min) return min;
  return value;
}

function formatPayReadable(num: number, currency: string): string {
  if (currency === "KRW" && num >= 10000) {
    const m = Math.floor(num / 10000);
    const r = num % 10000;
    return r > 0 ? `${m}만 ${formatPrice(r, "KRW")}` : `${m}만원`;
  }
  return formatPrice(num, currency);
}

export function JobsWriteForm({ category, onSuccess, onCancel }: JobsWriteFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const appSettings = useMemo(() => getAppSettings(), []);
  const currency = appSettings.defaultCurrency || "PHP";
  const maxImages = Math.max(1, appSettings.maxProductImages ?? 10);

  const [listingKind, setListingKind] = useState<JobListingKind>("hire");
  const [title, setTitle] = useState("");
  const [workCategory, setWorkCategory] = useState("");
  const [workCategoryOther, setWorkCategoryOther] = useState("");
  const [workTerm, setWorkTerm] = useState<string>("short");
  const [payType, setPayType] = useState<string>("hourly");
  const [payAmount, setPayAmount] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [tradeTopicChildId, setTradeTopicChildId] = useState("");

  const [todayMin, setTodayMin] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [workDateEnd, setWorkDateEnd] = useState("");

  useLayoutEffect(() => {
    const t = localDateString();
    setTodayMin(t);
    setWorkDate((prev) => prev || t);
    setWorkDateEnd((prev) => prev || t);
  }, []);
  const [workTimeStart, setWorkTimeStart] = useState("");
  const [workTimeEnd, setWorkTimeEnd] = useState("");
  const [sameDayPay, setSameDayPay] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const [availableTime, setAvailableTime] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("none");

  const [contactPhone, setContactPhone] = useState("");
  const [phoneAllowed, setPhoneAllowed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [images, setImages] = useState<ImageUploadItem[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const backHref = getCategoryHref(category);
  const payNum = payAmount.replace(/,/g, "");
  const payDisplay = payNum && !Number.isNaN(Number(payNum)) ? formatPayReadable(Number(payNum), currency) : "";

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (title.trim().length < JOB_TITLE_MIN || title.trim().length > JOB_TITLE_MAX) {
      next.title = `제목은 ${JOB_TITLE_MIN}~${JOB_TITLE_MAX}자로 입력해 주세요.`;
    }
    if (!workCategory.trim()) next.workCategory = "업종을 선택해 주세요.";
    if (workCategory === WORK_CATEGORY_OTHER) {
      const o = workCategoryOther.trim();
      if (o.length < 2) {
        next.workCategoryOther = "기타 업종을 2자 이상 입력해 주세요.";
      } else if (o.length > WORK_CATEGORY_OTHER_MAX) {
        next.workCategoryOther = `기타 업종은 최대 ${WORK_CATEGORY_OTHER_MAX}자예요.`;
      }
    }
    if (!region.trim() || !city.trim()) next.region = "지역과 동네를 선택해 주세요.";
    if (!description.trim()) next.description = "상세 내용을 입력해 주세요.";
    if (description.trim().length > JOB_DESCRIPTION_MAX) {
      next.description = `설명은 최대 ${JOB_DESCRIPTION_MAX}자까지예요.`;
    }
    const amountNum = payAmount.replace(/,/g, "");
    if (!amountNum || Number.isNaN(Number(amountNum)) || Number(amountNum) < 0) {
      next.payAmount = "급여 금액을 입력해 주세요.";
    } else if (payType === "hourly") {
      const n = Number(amountNum);
      if (currency === "KRW" && n < MIN_WAGE_2026) {
        next.payAmount = `최저시급은 ${formatPrice(MIN_WAGE_2026, "KRW")} 이상이에요.`;
      } else if (currency === "PHP" && n < MIN_WAGE_PHP_HOURLY) {
        next.payAmount = `시급은 ${formatPrice(MIN_WAGE_PHP_HOURLY, "PHP")} 이상으로 입력해 주세요.`;
      }
    }
    if (listingKind === "hire" && todayMin) {
      if (workDate.trim() && workDate < todayMin) {
        next.workDate = "근무 시작일은 오늘 이후만 선택할 수 있어요.";
      }
      if (workDateEnd.trim() && workDateEnd < todayMin) {
        next.workDateEnd = "근무 종료일은 오늘 이후만 선택할 수 있어요.";
      }
      const start = workDate.trim() || todayMin;
      if (workDateEnd.trim() && workDateEnd < start) {
        next.workDateEnd = "종료일은 시작일과 같거나 이후여야 해요.";
      }
    }
    if (!termsAgreed) next.termsAgreed = "안내 사항에 동의해 주세요.";
    if (contactPhone.trim() && phoneAllowed === false) {
      /* 연락처만 적고 공개 미체크 → 채팅만 유도 */
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [
    title,
    workCategory,
    workCategoryOther,
    listingKind,
    todayMin,
    workDate,
    workDateEnd,
    region,
    city,
    description,
    payAmount,
    payType,
    currency,
    termsAgreed,
    contactPhone,
    phoneAllowed,
  ]);

  const buildMeta = useCallback((): Record<string, unknown> => {
    const phone = contactPhone.trim();
    return {
      listing_kind: listingKind,
      /** 채팅/관리 필터 호환 */
      job_type: listingKind === "hire" ? "hire" : "seek",
      work_category: workCategory.trim(),
      work_category_other:
        workCategory === WORK_CATEGORY_OTHER
          ? workCategoryOther.trim().slice(0, WORK_CATEGORY_OTHER_MAX) || undefined
          : undefined,
      work_term: workTerm,
      pay_type: payType,
      pay_amount: payNum && !Number.isNaN(Number(payNum)) ? Number(payNum) : undefined,
      work_date_start: workDate.trim() || undefined,
      work_date_end: workDateEnd.trim() || undefined,
      work_time_start: workTimeStart.trim() || undefined,
      work_time_end: workTimeEnd.trim() || undefined,
      same_day_pay: sameDayPay,
      company_name: listingKind === "hire" ? companyName.trim() || undefined : undefined,
      available_time: listingKind === "work" ? availableTime.trim() || undefined : undefined,
      experience_level: listingKind === "work" ? experienceLevel : undefined,
      phone_allowed: phoneAllowed,
      contact_phone: phone || undefined,
      no_phone_calls: phone ? !phoneAllowed : true,
      terms_agreed: termsAgreed,
      /** 거래 채팅에서 일자리임을 표시 */
      trade_chat_kind: "job",
    };
  }, [
    listingKind,
    workCategory,
    workCategoryOther,
    workTerm,
    payType,
    payNum,
    workDate,
    workDateEnd,
    workTimeStart,
    workTimeEnd,
    sameDayPay,
    companyName,
    availableTime,
    experienceLevel,
    phoneAllowed,
    contactPhone,
    termsAgreed,
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        const user = getCurrentUser();
        if (!ensureClientAccessOrRedirect(router, user, pathname || `/write/${category.slug}`)) {
          return;
        }
        const files = images.map((i) => i.file).filter((f): f is File => !!f);
        const imageUrls = files.length > 0 && user?.id ? await uploadPostImages(files, user.id) : [];
        const meta = buildMeta();
        const priceNum = payNum ? Number(payNum) : null;
        const res = await createPost({
          type: "trade",
          categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
          title: title.trim(),
          content: description.trim(),
          price: priceNum,
          isPriceOfferEnabled: false,
          isFreeShare: false,
          region: region || undefined,
          city: city || undefined,
          barangay: undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          meta: Object.keys(meta).length > 0 ? meta : undefined,
        });
        if (res.ok) onSuccess(res.id);
        else {
          if (redirectForBlockedAction(router, res.error, pathname || `/write/${category.slug}`)) return;
          setErrors({ submit: res.error });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      validate,
      buildMeta,
      title,
      description,
      payNum,
      images,
      category,
      tradeTopicChildId,
      region,
      city,
      router,
      pathname,
      onSuccess,
    ]
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <WriteHeader categoryName={`${category.name} · 빠른 등록`} backHref={backHref} />
      <form onSubmit={handleSubmit} className="mx-auto max-w-[480px]">
        <div className="border-b border-gray-100 bg-white px-4 py-3">
          <p className="text-[13px] text-gray-500">채팅으로 연락 · 전화번호는 글에 노출되지 않아요</p>
        </div>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">무엇을 올리시나요?</p>
          <div className="grid grid-cols-2 gap-2">
            {JOB_LISTING_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setListingKind(opt.value)}
                className={`rounded-xl border px-3 py-3 text-[14px] font-medium ${
                  listingKind === opt.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <WriteTradeTopicSection
          category={category}
          value={tradeTopicChildId}
          onChange={setTradeTopicChildId}
        />

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">제목</p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={listingKind === "hire" ? "예) 주말 카페 서빙 알바" : "예) 평일 오전 청소 가능해요"}
            maxLength={JOB_TITLE_MAX}
            className={`w-full rounded-lg border px-3 py-2.5 text-[15px] ${
              errors.title ? "border-red-400 bg-red-50" : "border-gray-300"
            }`}
          />
          {errors.title && <p className="mt-1 text-[13px] text-red-500">{errors.title}</p>}
          <p className="mt-1 text-[12px] text-gray-500">{title.length}/{JOB_TITLE_MAX}</p>
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">업종</p>
          <div className="flex flex-wrap gap-2">
            {WORK_CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setWorkCategory(cat);
                  if (cat !== WORK_CATEGORY_OTHER) setWorkCategoryOther("");
                }}
                className={`rounded-full border px-3 py-1.5 text-[13px] ${
                  workCategory === cat
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {workCategory === WORK_CATEGORY_OTHER && (
            <div className="mt-3">
              <label className="mb-1 block text-[13px] font-medium text-gray-700">기타 업종 (직접 입력)</label>
              <input
                type="text"
                value={workCategoryOther}
                onChange={(e) => setWorkCategoryOther(e.target.value.slice(0, WORK_CATEGORY_OTHER_MAX))}
                placeholder="예) 이벤트 스태프, 물류 피킹"
                className={`w-full rounded-lg border px-3 py-2.5 text-[15px] ${
                  errors.workCategoryOther ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
              />
              <p className="mt-1 text-[12px] text-gray-500">
                {workCategoryOther.length}/{WORK_CATEGORY_OTHER_MAX} · 상세·목록에 함께 표시돼요
              </p>
            </div>
          )}
          {errors.workCategory && <p className="mt-1 text-[13px] text-red-500">{errors.workCategory}</p>}
          {errors.workCategoryOther && (
            <p className="mt-1 text-[13px] text-red-500">{errors.workCategoryOther}</p>
          )}
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <LocationSelector
            embedded
            region={region}
            city={city}
            onRegionChange={setRegion}
            onCityChange={setCity}
            error={errors.region}
            label="지역 · 동네"
            showRequired
          />
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">근무 형태</p>
          <div className="flex flex-wrap gap-2">
            {JOB_WORK_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWorkTerm(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-[13px] ${
                  workTerm === opt.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {listingKind === "hire" && (
          <>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-semibold text-gray-900">근무 날짜</p>
              <p className="mb-2 text-[12px] text-gray-500">오늘 이전 날짜는 선택할 수 없어요. 기본은 오늘입니다.</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-[11px] text-gray-500">시작</span>
                  <input
                    type="date"
                    min={todayMin || undefined}
                    value={workDate}
                    onChange={(e) => {
                      const min = todayMin || localDateString();
                      const v = clampDateNotBefore(e.target.value, min);
                      setWorkDate(v);
                      setWorkDateEnd((end) => {
                        if (!end) return end;
                        return end < v ? v : end;
                      });
                    }}
                    className={`w-full rounded-lg border px-2 py-2 text-[14px] ${
                      errors.workDate ? "border-red-400 bg-red-50" : "border-gray-300"
                    }`}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-gray-500">종료</span>
                  <input
                    type="date"
                    min={
                      (() => {
                        const t = todayMin || "";
                        const s = workDate || "";
                        if (!t && !s) return undefined;
                        if (!s) return t || undefined;
                        if (!t) return s;
                        return s >= t ? s : t;
                      })()
                    }
                    value={workDateEnd}
                    onChange={(e) => {
                      const min = todayMin || localDateString();
                      const floor = (workDate || min) >= min ? workDate || min : min;
                      const v = clampDateNotBefore(e.target.value, min);
                      setWorkDateEnd(v < floor ? floor : v);
                    }}
                    className={`w-full rounded-lg border px-2 py-2 text-[14px] ${
                      errors.workDateEnd ? "border-red-400 bg-red-50" : "border-gray-300"
                    }`}
                  />
                </div>
              </div>
              {(errors.workDate || errors.workDateEnd) && (
                <p className="mt-1 text-[13px] text-red-500">{errors.workDate || errors.workDateEnd}</p>
              )}
            </section>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-semibold text-gray-900">근무 시간 (선택)</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={workTimeStart}
                  onChange={(e) => setWorkTimeStart(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-[14px]"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="time"
                  value={workTimeEnd}
                  onChange={(e) => setWorkTimeEnd(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-[14px]"
                />
              </div>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sameDayPay}
                  onChange={(e) => setSameDayPay(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-[14px] text-gray-800">당일 지급</span>
              </label>
            </section>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-semibold text-gray-900">업체명 (선택)</p>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="브랜드·상호"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px]"
              />
            </section>
          </>
        )}

        {listingKind === "work" && (
          <>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-semibold text-gray-900">가능한 시간</p>
              <input
                type="text"
                value={availableTime}
                onChange={(e) => setAvailableTime(e.target.value)}
                placeholder="예) 평일 9~15시, 주말 종일"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px]"
              />
            </section>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-semibold text-gray-900">경력</p>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExperienceLevel(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-[13px] ${
                      experienceLevel === opt.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">급여</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {PAY_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPayType(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-[13px] ${
                  payType === opt.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5">
            <input
              type="text"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(formatPriceInput(e.target.value))}
              placeholder="0"
              className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] outline-none ${
                errors.payAmount ? "text-red-600" : ""
              }`}
            />
            <span className="text-[15px] text-gray-600">{getCurrencyUnitLabel(currency)}</span>
          </div>
          {payDisplay && <p className="mt-1 text-[12px] text-gray-500">{payDisplay}</p>}
          {errors.payAmount && <p className="mt-1 text-[13px] text-red-500">{errors.payAmount}</p>}
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">상세 설명</p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="하는 일, 분위기, 준비물 등을 적어 주세요."
            rows={5}
            maxLength={JOB_DESCRIPTION_MAX}
            className={`w-full resize-none rounded-lg border px-3 py-2.5 text-[14px] ${
              errors.description ? "border-red-400 bg-red-50" : "border-gray-300"
            }`}
          />
          <p className="mt-1 text-right text-[12px] text-gray-500">{description.length}/{JOB_DESCRIPTION_MAX}</p>
          {errors.description && <p className="text-[13px] text-red-500">{errors.description}</p>}
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">연락 (선택)</p>
          <p className="mb-2 text-[12px] text-gray-500">기본은 채팅만 사용해요. 전화번호는 글 본문에 나오지 않습니다.</p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 22))}
            placeholder={PH_MOBILE_PLACEHOLDER}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px]"
          />
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={phoneAllowed}
              onChange={(e) => setPhoneAllowed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <span className="text-[13px] text-gray-700">
              채팅방에서 상대에게만 연락처 공개 (체크하지 않으면 번호는 저장만 되고 대화창에도 안 보여요)
            </span>
          </label>
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <span className="text-[13px] text-gray-700">
              허위·불법 채용 금지, 최저임금·근로 관련 법령 준수에 동의합니다.
            </span>
          </label>
          {errors.termsAgreed && <p className="mt-1 text-[13px] text-red-500">{errors.termsAgreed}</p>}
        </section>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-semibold text-gray-900">사진 (선택)</p>
          <ImageUploader value={images} onChange={setImages} maxCount={maxImages} label="사진 추가" />
        </section>

        {errors.submit && <p className="px-4 py-2 text-[13px] text-red-500">{errors.submit}</p>}

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-4 py-3 safe-area-pb">
          <SubmitButton label="등록하기" submitting={submitting} onCancel={onCancel} />
        </div>
      </form>
    </div>
  );
}

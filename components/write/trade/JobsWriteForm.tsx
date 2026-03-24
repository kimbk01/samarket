"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice, formatPriceInput, getCurrencyUnitLabel } from "@/lib/utils/format";
import { getLocationLabel } from "@/lib/products/form-options";
import {
  JOB_TYPE_OPTIONS,
  WORK_TERM_OPTIONS,
  PAY_TYPE_OPTIONS,
  WORK_CATEGORY_OPTIONS,
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

const STEP_TITLES: Record<number, string> = {
  1: "어떤 분을 찾고 계세요?",
  2: "근무 조건과 급여",
  3: "업체 정보를 알려주세요.",
  4: "일과 관련된 사진",
};

/** 금액을 "2만원" / ₱ 등 읽기 쉽게 표시 */
function formatPayReadable(num: number, currency: string): string {
  if (currency === "KRW" && num >= 10000) {
    const man = Math.floor(num / 10000);
    return `₩ ${man}만원`;
  }
  return formatPrice(num, currency);
}

export function JobsWriteForm({ category, onSuccess, onCancel }: JobsWriteFormProps) {
  const appSettings = useMemo(() => getAppSettings(), []);
  const currency = appSettings.defaultCurrency || "PHP";
  const maxImages = Math.max(1, appSettings.maxProductImages ?? 10);

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [jobType, setJobType] = useState<string>("work");
  const [title, setTitle] = useState("");
  const [workCategory, setWorkCategory] = useState("");
  const [workTerm, setWorkTerm] = useState<string>("short");

  // Step 2
  const [workDateStart, setWorkDateStart] = useState("");
  const [workDateEnd, setWorkDateEnd] = useState("");
  const [workTimeStart, setWorkTimeStart] = useState("");
  const [workTimeEnd, setWorkTimeEnd] = useState("");
  const [workNegotiable, setWorkNegotiable] = useState(false);
  const [payType, setPayType] = useState<string>("hourly");
  const [payAmount, setPayAmount] = useState("");
  const [sameDayPay, setSameDayPay] = useState(false);
  const [description, setDescription] = useState("");
  const [noMinors, setNoMinors] = useState(false);

  // Step 3
  const [companyName, setCompanyName] = useState("");
  const [workAddress, setWorkAddress] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [tradeTopicChildId, setTradeTopicChildId] = useState("");

  useEffect(() => {
    setTradeTopicChildId("");
  }, [category.id]);
  const [noPhoneCalls, setNoPhoneCalls] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // Step 4
  const [images, setImages] = useState<ImageUploadItem[]>([]);

  const validateStep1 = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (title.trim().length < JOB_TITLE_MIN || title.trim().length > JOB_TITLE_MAX) {
      next.title = `최소 ${JOB_TITLE_MIN}자에서 최대 ${JOB_TITLE_MAX}자까지 입력할 수 있어요.`;
    }
    if (!workCategory.trim()) next.workCategory = "업종을 선택해 주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [title, workCategory]);

  const validateStep2 = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!description.trim()) next.description = "상세 내용을 입력해 주세요.";
    if (description.trim().length > JOB_DESCRIPTION_MAX) next.description = `최대 ${JOB_DESCRIPTION_MAX}자까지 입력할 수 있어요.`;
    const amountNum = payAmount.replace(/,/g, "");
    if (!amountNum || Number.isNaN(Number(amountNum)) || Number(amountNum) < 0) {
      next.payAmount = "급여를 입력해 주세요.";
    }
    if (payType === "hourly" && amountNum && Number(amountNum) > 0) {
      const n = Number(amountNum);
      if (currency === "KRW" && n < MIN_WAGE_2026) {
        next.payAmount = `최저시급은 ${formatPrice(MIN_WAGE_2026, "KRW")} 이상이에요.`;
      } else if (currency === "PHP" && n < MIN_WAGE_PHP_HOURLY) {
        next.payAmount = `시급은 ${formatPrice(MIN_WAGE_PHP_HOURLY, "PHP")} 이상으로 입력해 주세요. (지역·업종별 최저임금은 상이할 수 있어요.)`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [description, payAmount, payType, currency]);

  const validateStep3 = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!companyName.trim()) next.companyName = "업체명을 입력해 주세요.";
    if (!workAddress.trim() && !(region && city))
      next.workAddress = "주소를 입력하거나 지역과 동네를 선택해 주세요.";
    if (!contactPhone.trim()) next.contactPhone = "연락처를 입력해 주세요.";
    if (!termsAgreed) next.termsAgreed = "준수 사항에 동의해 주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [companyName, workAddress, region, city, contactPhone, termsAgreed]);

  const handleNext = useCallback(() => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setErrors({});
    setStep((s) => Math.min(4, s + 1));
  }, [step, validateStep1, validateStep2, validateStep3]);

  const buildMeta = useCallback((): Record<string, unknown> => {
    const address = workAddress.trim() || (region && city ? getLocationLabel(region, city) : "");
    return {
      job_type: jobType,
      work_category: workCategory.trim(),
      work_term: workTerm,
      work_date_start: workDateStart.trim() || undefined,
      work_date_end: workDateEnd.trim() || undefined,
      work_time_start: workTimeStart.trim() || undefined,
      work_time_end: workTimeEnd.trim() || undefined,
      work_negotiable: workNegotiable,
      pay_type: payType,
      pay_amount: payAmount.trim() ? Number(payAmount.replace(/,/g, "")) : undefined,
      same_day_pay: sameDayPay,
      no_minors: noMinors,
      company_name: companyName.trim(),
      work_address: address,
      work_region: region || undefined,
      work_city: city || undefined,
      contact_phone: contactPhone.trim(),
      no_phone_calls: noPhoneCalls,
      terms_agreed: termsAgreed,
    };
  }, [
    jobType,
    workCategory,
    workTerm,
    workDateStart,
    workDateEnd,
    workTimeStart,
    workTimeEnd,
    workNegotiable,
    payType,
    payAmount,
    sameDayPay,
    noMinors,
    companyName,
    workAddress,
    region,
    city,
    contactPhone,
    noPhoneCalls,
    termsAgreed,
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (step < 4) {
        handleNext();
        return;
      }
      if (!validateStep1() || !validateStep2() || !validateStep3()) {
        setStep(1);
        if (!validateStep1()) return;
        setStep(2);
        if (!validateStep2()) return;
        setStep(3);
        if (!validateStep3()) return;
        setStep(4);
        return;
      }
      setSubmitting(true);
      try {
        const user = getCurrentUser();
        const files = images.map((i) => i.file).filter((f): f is File => !!f);
        const imageUrls = files.length > 0 && user?.id ? await uploadPostImages(files, user.id) : [];
        const meta = buildMeta();
        const priceNum = payAmount.trim() ? Number(payAmount.replace(/,/g, "")) : null;
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
        else setErrors({ submit: res.error });
      } finally {
        setSubmitting(false);
      }
    },
    [step, buildMeta, title, description, payAmount, images, category, tradeTopicChildId, region, city, validateStep1, validateStep2, validateStep3, handleNext, onSuccess]
  );

  const backHref = getCategoryHref(category);
  const payNum = payAmount.replace(/,/g, "");
  const payDisplay = payNum && !Number.isNaN(Number(payNum)) ? formatPayReadable(Number(payNum), currency) : "";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <WriteHeader categoryName={category.name} backHref={backHref} />
      <form onSubmit={handleSubmit} className="mx-auto max-w-[480px]">
        {/* Step progress: 상단에 단계 안내 (선택) */}
        <div className="border-b border-gray-100 bg-white px-4 py-3">
          <p className="text-[15px] font-semibold text-gray-900">{STEP_TITLES[step]}</p>
        </div>

        {step === 1 && (
          <>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-3 text-[15px] font-bold text-gray-900">어떤 분을 찾고 계세요?</p>
              <ul className="space-y-2">
                {JOB_TYPE_OPTIONS.map((opt) => (
                  <li key={opt.value}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                        jobType === opt.value ? "border-gray-300 bg-gray-50" : "border-gray-100 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="jobType"
                        value={opt.value}
                        checked={jobType === opt.value}
                        onChange={() => setJobType(opt.value)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900">{opt.label}</span>
                        <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600">
                          {opt.badge}
                        </span>
                        <p className="mt-0.5 text-[12px] text-gray-500">{opt.example}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-[12px] text-gray-600">
                지금 알바 구하면 하루 평균 3명의 이웃들이 지원해요.
              </p>
            </section>

            <WriteTradeTopicSection
              category={category}
              value={tradeTopicChildId}
              onChange={setTradeTopicChildId}
            />

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">어떤 제목으로 올려볼까요?</p>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목을 입력해주세요."
                maxLength={JOB_TITLE_MAX}
                className={`w-full rounded-lg border px-3 py-2.5 text-[15px] ${
                  errors.title ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                aria-invalid={!!errors.title}
              />
              {errors.title && <p className="mt-1 text-[13px] text-red-500">{errors.title}</p>}
              <p className="mt-1 text-[12px] text-gray-500">{title.length}/{JOB_TITLE_MAX}자</p>
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">업종</p>
              <div className="flex flex-wrap gap-2">
                {WORK_CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setWorkCategory(cat)}
                    className={`rounded-full border px-4 py-2 text-[13px] ${
                      workCategory === cat
                        ? "border-gray-800 bg-gray-800 text-white"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {errors.workCategory && <p className="mt-1 text-[13px] text-red-500">{errors.workCategory}</p>}
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">원하는 근무 조건이 무엇인가요?</p>
              <div className="flex flex-wrap gap-2">
                {WORK_TERM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWorkTerm(opt.value)}
                    className={`rounded-full border px-4 py-2 text-[13px] ${
                      workTerm === opt.value
                        ? "border-gray-800 bg-gray-800 text-white"
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

        {step === 2 && (
          <>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">일하는 날짜</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={workDateStart}
                  onChange={(e) => setWorkDateStart(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-[14px]"
                />
                <input
                  type="date"
                  value={workDateEnd}
                  onChange={(e) => setWorkDateEnd(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-[14px]"
                />
              </div>
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">일하는 시간</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={workTimeStart}
                  onChange={(e) => setWorkTimeStart(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-[14px]"
                />
                <span className="text-gray-500">~</span>
                <input
                  type="time"
                  value={workTimeEnd}
                  onChange={(e) => setWorkTimeEnd(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-[14px]"
                />
              </div>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={workNegotiable}
                  onChange={(e) => setWorkNegotiable(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-[14px] text-gray-700">협의 가능</span>
              </label>
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">급여는 어떻게 할까요?</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PAY_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPayType(opt.value)}
                    className={`rounded-full border px-4 py-2 text-[13px] ${
                      payType === opt.value
                        ? "border-gray-800 bg-gray-800 text-white"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={payAmount}
                  onChange={(e) => setPayAmount(formatPriceInput(e.target.value))}
                  placeholder="0"
                  className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] outline-none ${
                    errors.payAmount ? "text-red-600" : ""
                  }`}
                />
                <span className="text-[15px] text-gray-600">{getCurrencyUnitLabel(currency)}</span>
              </div>
              {payDisplay && <p className="mt-1 text-[13px] text-gray-500">{payDisplay}</p>}
              <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-[12px] text-gray-600">
                {currency === "KRW" ? (
                  <>
                    2026년 최저시급은{" "}
                    <span className="underline">{formatPrice(MIN_WAGE_2026, "KRW")}</span>이에요.
                  </>
                ) : currency === "PHP" ? (
                  <>
                    시급 안내:{" "}
                    <span className="underline">{formatPrice(MIN_WAGE_PHP_HOURLY, "PHP")}</span> 이상을 권장해요.
                    (NCR 등 지역·업종별 최저임금은 다를 수 있어요.)
                  </>
                ) : (
                  <>급여는 선택하신 통화 기준으로 입력해 주세요.</>
                )}
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sameDayPay}
                  onChange={(e) => setSameDayPay(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-[14px] text-gray-700">근무 당일에 지급</span>
              </label>
              {errors.payAmount && <p className="mt-1 text-[13px] text-red-500">{errors.payAmount}</p>}
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[15px] font-bold text-gray-900">일에 대해 자세히 설명해주세요.</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="도움이 필요한 일거리에 대한 구체적인 사항을 알려주세요. (요청 업무 내용, 알바 환경, 준비물 등)"
                rows={5}
                maxLength={JOB_DESCRIPTION_MAX}
                className={`w-full resize-none rounded-lg border px-3 py-2.5 text-[14px] ${
                  errors.description ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                aria-invalid={!!errors.description}
              />
              <div className="mt-1 flex justify-between text-[12px] text-gray-500">
                <span>{errors.description || ""}</span>
                <span>{description.length}/{JOB_DESCRIPTION_MAX}</span>
              </div>
              {errors.description && <p className="mt-0.5 text-[13px] text-red-500">{errors.description}</p>}
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={noMinors}
                  onChange={(e) => setNoMinors(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-[14px] text-gray-700">미성년자 불가 업종이에요</span>
                <span className="text-gray-400" title="미성년자 고용이 제한된 업종인 경우 체크">?</span>
              </label>
            </section>
          </>
        )}

        {step === 3 && (
          <>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-medium text-gray-800">업체/브랜드명</p>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="예) 당근가게"
                className={`w-full rounded-lg border px-3 py-2.5 text-[15px] ${
                  errors.companyName ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                aria-invalid={!!errors.companyName}
              />
              {errors.companyName && <p className="mt-1 text-[13px] text-red-500">{errors.companyName}</p>}
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-medium text-gray-800">일하는 장소</p>
              <LocationSelector
                embedded
                className="mt-1"
                region={region}
                city={city}
                onRegionChange={setRegion}
                onCityChange={setCity}
                error={errors.workAddress}
                label="지역 · 동네"
                showRequired={false}
              />
              <p className="mt-3 mb-1 text-[13px] font-medium text-gray-800">상세 주소 (선택)</p>
              <div className="relative">
                <input
                  type="text"
                  value={workAddress}
                  onChange={(e) => setWorkAddress(e.target.value)}
                  placeholder="도로명, 건물명, 층 등 (지역·동네는 위에서 선택 또는 ZIP)"
                  className={`w-full rounded-lg border py-2.5 pl-3 pr-10 text-[15px] ${
                    errors.workAddress ? "border-red-400 bg-red-50" : "border-gray-300"
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
                  🔍
                </span>
              </div>
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <p className="mb-2 text-[14px] font-medium text-gray-800">연락처</p>
              <p className="mb-2 text-[12px] text-gray-500">연락처는 안심번호로 표시돼요.</p>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contactPhone}
                onChange={(e) =>
                  setContactPhone(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 22))
                }
                placeholder={PH_MOBILE_PLACEHOLDER}
                className={`w-full rounded-lg border px-3 py-2.5 text-[15px] ${
                  errors.contactPhone ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                aria-invalid={!!errors.contactPhone}
              />
              {errors.contactPhone && <p className="mt-1 text-[13px] text-red-500">{errors.contactPhone}</p>}
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={noPhoneCalls}
                  onChange={(e) => setNoPhoneCalls(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-[14px] text-gray-700">전화 안 받기</span>
              </label>
            </section>

            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  className="mt-1 rounded border-gray-300"
                  aria-invalid={!!errors.termsAgreed}
                />
                <div>
                  <span className="text-[14px] font-medium text-gray-800">알바 준수 사항 동의</span>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    서비스 이용약관 · 최저임금 · 근로기준법 · 고용차별 금지 등에 동의합니다.
                  </p>
                </div>
              </label>
              {errors.termsAgreed && <p className="mt-1 text-[13px] text-red-500">{errors.termsAgreed}</p>}
            </section>
          </>
        )}

        {step === 4 && (
          <section className="border-b border-gray-100 bg-white px-4 py-4">
            <p className="mb-2 text-[15px] font-bold text-gray-900">일과 관련된 사진 (선택)</p>
            <p className="mb-3 text-[12px] text-gray-500">사진이 있으면 더 많은 사람들이 확인해요.</p>
            <ImageUploader value={images} onChange={setImages} maxCount={maxImages} label="사진 추가" />
          </section>
        )}

        {errors.submit && <p className="px-4 py-2 text-[13px] text-red-500">{errors.submit}</p>}

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-4 py-3 safe-area-pb">
          {step < 4 ? (
            <div className="flex gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-[15px] text-gray-700"
                >
                  이전
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 rounded-lg bg-gray-900 py-3.5 text-[15px] font-semibold text-white"
              >
                다음
              </button>
            </div>
          ) : (
            <SubmitButton
              label="등록하기"
              submitting={submitting}
              onCancel={onCancel}
            />
          )}
        </div>
      </form>
    </div>
  );
}

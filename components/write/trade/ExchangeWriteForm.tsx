"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useMemo } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { updateTradePostFromCreatePayload } from "@/lib/posts/updateTradePost";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { formatPriceInput } from "@/lib/utils/format";
import {
  EXCHANGE_CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  DEFAULT_RATES_PHP_BASE,
  EXCHANGE_DIRECTION_OPTIONS,
  PREP_OPTIONS,
} from "@/lib/exchange/form-options";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { TradeDefaultLocationBlock } from "../shared/TradeDefaultLocationBlock";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";

interface ExchangeWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
  tradePolicy?: TradePolicyClient | null;
}


const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

function formatRatesCriteria(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const min = date.getMinutes();
  return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function buildExchangeTitle(direction: string): string {
  return direction === "sell" ? "페소 팝니다" : "페소 삽니다";
}

export function ExchangeWriteForm({
  category,
  onSuccess,
  onCancel,
  editPostId,
  ownerEditSnapshot,
  tradePolicy = null,
}: ExchangeWriteFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const appSettings = useMemo(() => getAppSettings(), []);
  /** 환전 전용 폼은 거래 지역 필수. exchange 카테고리 DB 설정에 has_location=false가 있어도 항상 표시 */
  const hasLocation = true;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [descriptionAppend, setDescriptionAppend] = useState("");
  const coreLocked = Boolean(editPostId && tradePolicy && !tradePolicy.allowEditCore);
  const showDescriptionAppend = Boolean(editPostId && tradePolicy?.allowAppendOnlyDescription);
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const syncTradeRegionCity = useCallback((rid: string, cid: string) => {
    setRegion(rid);
    setCity(cid);
  }, []);

  const [direction, setDirection] = useState<"sell" | "buy">("sell");
  const [liveRates, setLiveRates] = useState<ExchangeRates | null>(null);
  const [ratesFetchedAt, setRatesFetchedAt] = useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [rate, setRate] = useState("");
  const [ratePlus, setRatePlus] = useState("0");
  const [amount, setAmount] = useState("");
  const [tradeTopicChildId, setTradeTopicChildId] = useState("");

  useEffect(() => {
    setTradeTopicChildId("");
  }, [category.id]);

  useEffect(() => {
    if (!editPostId || !ownerEditSnapshot) return;
    const m = ownerEditSnapshot.meta ?? {};
    const dir = m.exchange_direction === "buy" ? "buy" : "sell";
    setDirection(dir);
    setRegion(ownerEditSnapshot.region?.trim() ?? "");
    setCity(ownerEditSnapshot.city?.trim() ?? "");

    const baseRaw = m.exchange_rate_base;
    const plusRaw = m.exchange_rate_plus;
    const combinedRaw = m.exchange_rate;
    const baseNum = typeof baseRaw === "number" ? baseRaw : Number(baseRaw);
    const plusNum = typeof plusRaw === "number" ? plusRaw : Number(plusRaw);
    const combinedNum = typeof combinedRaw === "number" ? combinedRaw : Number(combinedRaw);
    if (Number.isFinite(baseNum) && baseNum > 0) {
      setRate(String(baseNum));
    } else if (Number.isFinite(combinedNum) && combinedNum > 0) {
      setRate(String(combinedNum));
    }
    if (Number.isFinite(plusNum)) {
      setRatePlus(String(plusNum));
    }

    const amt = m.amount ?? ownerEditSnapshot.price;
    const amtNum = typeof amt === "number" ? amt : Number(amt);
    if (Number.isFinite(amtNum) && amtNum > 0) {
      setAmount(formatPriceInput(String(amtNum)));
    }

    const sp = m.seller_prep;
    const bp = m.buyer_prep;
    setSellerPrep(Array.isArray(sp) ? sp.filter((x): x is string => typeof x === "string") : []);
    setBuyerPrep(Array.isArray(bp) ? bp.filter((x): x is string => typeof x === "string") : []);
    setMemo(ownerEditSnapshot.content ?? "");

    const crit = m.rate_criteria_at;
    if (typeof crit === "string" && crit.trim()) setRatesFetchedAt(crit.trim());
  }, [editPostId, ownerEditSnapshot]);

  /** 항상 페소↔한화. 저장/표시는 "1 PHP = X KRW"로 통일. */
  const fromCurrency = "PHP";
  const toCurrency = "KRW";

  /** 쓰기 화면 진입 시점에 현재 환율 조회 (우리 API → 서버가 외부 API 호출) */
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchExchangeRatesViaApp().then((rates) => {
        if (!cancelled && rates) {
          setLiveRates(rates);
          setRatesFetchedAt(formatRatesCriteria(new Date()));
        }
      });
    setRatesLoading(true);
    load().finally(() => {
      if (!cancelled) setRatesLoading(false);
    });
    const timer = setInterval(() => {
      if (cancelled) return;
      load();
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  /**
   * 기준 환율(1 PHP = ? KRW) — API 값으로 채움.
   * (이전: 로딩 중 24.99 폴백을 먼저 넣어 두면 `rate`가 비어 있지 않아 API 24.79가 절대 반영되지 않는 버그가 있었음)
   */
  useEffect(() => {
    const krw = liveRates?.KRW;
    if (typeof krw !== "number" || krw <= 0) return;
    const next = krw.toFixed(2);
    const fallback = DEFAULT_RATES_PHP_BASE.KRW;
    setRate((prev) => {
      const t = prev.trim();
      if (t === "") return next;
      const n = Number(t.replace(/,/g, ""));
      if (!Number.isFinite(n)) return next;
      /** 정적 폴백(24.99)만 들어간 상태면 실시간 환율로 교체 — 수동 입력값은 유지 */
      if (Math.abs(n - fallback) < 1e-6) return next;
      return prev;
    });
  }, [liveRates]);

  /** API 실패·null 일 때만 빈 칸에 정적 폴백 (로딩 끝난 뒤) */
  useEffect(() => {
    if (ratesLoading) return;
    const krw = liveRates?.KRW;
    if (typeof krw === "number" && krw > 0) return;
    setRate((prev) => {
      if (prev.trim() !== "") return prev;
      return String(DEFAULT_RATES_PHP_BASE.KRW);
    });
  }, [ratesLoading, liveRates]);

  const [sellerPrep, setSellerPrep] = useState<string[]>([]);
  const [buyerPrep, setBuyerPrep] = useState<string[]>([]);
  const [memo, setMemo] = useState("");

  /** 페소 팝니다: 판매자 준비물 미노출 → 이전 선택값 제거 */
  useEffect(() => {
    if (direction === "sell") setSellerPrep([]);
  }, [direction]);

  const rateNum = rate.replace(/,/g, "");
  const ratePlusNum = ratePlus.replace(/,/g, "");
  const amountNum = amount.replace(/,/g, "");
  const baseRateValue = rateNum ? Number(rateNum) : 0;
  const ratePlusValue = ratePlusNum !== "" && !Number.isNaN(Number(ratePlusNum)) ? Number(ratePlusNum) : 0;
  const rateValue = baseRateValue + ratePlusValue;
  const amountValue = amountNum ? Number(amountNum) : 0;
  const converted = rateValue > 0 && amountValue > 0 ? amountValue * rateValue : 0;

  const IDENTITY_NOT_REQUIRED = "identity_not_required";

  const togglePrep = (set: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    set((prev) => {
      if (prev.includes(value)) return prev.filter((x) => x !== value);
      if (value === IDENTITY_NOT_REQUIRED) return [IDENTITY_NOT_REQUIRED];
      return [...prev.filter((x) => x !== IDENTITY_NOT_REQUIRED), value];
    });
  };

  const isOtherPrepDisabled = (prep: string[], value: string) =>
    prep.includes(IDENTITY_NOT_REQUIRED) && value !== IDENTITY_NOT_REQUIRED;

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (rateValue <= 0 || Number.isNaN(rateValue)) {
      next.rate = "기준 환율 또는 기준+가산을 입력해 주세요.";
    }
    if (!amount.trim() || Number.isNaN(Number(amount.replace(/,/g, ""))) || Number(amount.replace(/,/g, "")) <= 0) {
      next.amount = "금액을 입력해 주세요.";
    }
    if (direction === "sell") {
      if (buyerPrep.length === 0) {
        next.prep = "구매자 준비물을 한 가지 이상 선택해 주세요.";
      }
    } else if (sellerPrep.length === 0 || buyerPrep.length === 0) {
      next.prep =
        "페소 삽니다: 판매자 준비물·구매자 준비물을 각각 한 가지 이상 선택해 주세요.";
    }
    if (hasLocation && (!region || !city)) {
      next.location =
        "거래 지역을 읽지 못했습니다. 주소 관리에서 대표 주소를 저장한 뒤 다시 시도해 주세요.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [rateValue, amount, direction, sellerPrep.length, buyerPrep.length, hasLocation, region, city]);

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
        const title = buildExchangeTitle(direction);
        const content = memo.trim() || "환전 거래합니다. 매너와 속도가 중요해요.";
        const meta: Record<string, unknown> = {
          exchange_direction: direction,
          from_currency: "PHP",
          to_currency: "KRW",
          exchange_rate: rateValue,
          exchange_rate_base: baseRateValue,
          exchange_rate_plus: ratePlusValue,
          rate_criteria_at: ratesFetchedAt ?? undefined,
          amount: amountValue,
          converted_amount: converted,
          seller_prep: direction === "sell" ? [] : sellerPrep,
          buyer_prep: buyerPrep,
        };
        const payload = {
          type: "trade" as const,
          categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
          title,
          content,
          price: amountValue,
          imageUrls: [],
          region: region || undefined,
          city: city || undefined,
          meta,
        };
        if (editPostId) {
          const res = await updateTradePostFromCreatePayload(editPostId, payload, {
            descriptionAppend:
              showDescriptionAppend && descriptionAppend.trim()
                ? descriptionAppend.trim()
                : undefined,
          });
          if (res.ok) onSuccess(editPostId);
          else {
            if (redirectForBlockedAction(router, res.error, pathname || `/products/${editPostId}/edit`)) return;
            setErrors({ submit: res.error });
          }
        } else {
          const res = await createPost(payload);
          if (res.ok) onSuccess(res.id);
          else {
            if (redirectForBlockedAction(router, res.error, pathname || `/write/${category.slug}`)) return;
            setErrors({ submit: res.error });
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      direction,
      rateValue,
      baseRateValue,
      ratePlusValue,
      ratesFetchedAt,
      amountValue,
      converted,
      sellerPrep,
      buyerPrep,
      memo,
      category,
      tradeTopicChildId,
      region,
      city,
      validate,
      onSuccess,
      router,
      pathname,
      editPostId,
      showDescriptionAppend,
      descriptionAppend,
    ]
  );

  const backHref = editPostId ? `/products/${editPostId}` : getCategoryHref(category);
  const baseRates = liveRates ?? DEFAULT_RATES_PHP_BASE;
  const ratesForBoard = useMemo(() => {
    const result: Record<string, number> = { PHP: 1 };
    result.KRW = rateValue > 0 ? rateValue : (baseRates.KRW ?? 0);
    return result;
  }, [rateValue, baseRates]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <WriteScreenTier1Sync
        title={editPostId ? `${category.name} · 수정` : `${category.name} · 글쓰기`}
        backHref={backHref}
      />
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[480px] md:max-w-2xl lg:max-w-3xl"
      >
        {tradePolicy?.hint ? (
          <div className="mx-4 mt-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
            {tradePolicy.hint}
          </div>
        ) : null}
        <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
        {/* 환율 상황판 (자동 조회) */}
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <h3 className="mb-3 text-[15px] font-bold text-gray-900">환율 상황판</h3>
          {ratesLoading ? (
            <p className="rounded-ui-rect border border-gray-200 bg-gray-50/50 p-4 text-center text-[14px] text-gray-500">환율 불러오는 중…</p>
          ) : (
            <>
              <p className="mb-2 text-[12px] text-gray-500">
                {ratesFetchedAt ? `${ratesFetchedAt} 기준 환율` : "기준: 페소 1 (기본값)"}
              </p>
              <ul className="space-y-2 rounded-ui-rect border border-gray-200 bg-gray-50/50 p-3">
                {EXCHANGE_CURRENCIES.map((code) => (
                  <li key={code} className="flex items-center justify-between text-[14px]">
                    <span className="font-medium text-gray-800">{code}</span>
                    <span className="text-gray-600">{CURRENCY_SYMBOLS[code]} {code === fromCurrency ? "1" : (ratesForBoard[code as keyof typeof ratesForBoard] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <WriteTradeTopicSection
          category={category}
          value={tradeTopicChildId}
          onChange={setTradeTopicChildId}
        />

        {/* 팝니다 = 페소 팝니다 / 삽니다 = 페소 삽니다. 금액은 항상 페소. */}
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <div className="flex gap-2">
            {EXCHANGE_DIRECTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={coreLocked}
                onClick={() => setDirection(opt.value as "sell" | "buy")}
                className={`flex-1 rounded-ui-rect border py-2.5 text-[14px] font-medium ${
                  direction === opt.value ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {opt.value === "sell" ? "페소 팝니다" : "페소 삽니다"}
              </button>
            ))}
          </div>
        </section>

        {hasLocation && (
          <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
            <TradeDefaultLocationBlock
              editPostId={editPostId}
              region={region}
              city={city}
              onSyncRegionCity={syncTradeRegionCity}
              error={errors.location}
              readOnly={coreLocked}
            />
          </div>
        )}

        {/* 기준 환율 | 기준 환율 + (가산) — 한 행 50% 분할 */}
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium leading-snug text-gray-800 sm:text-[12px]">
                기준 환율
                <span className="block font-normal text-[10px] text-gray-500 sm:inline sm:ml-0.5 sm:text-[11px]">
                  (1 PHP = ? KRW)
                </span>
              </label>
              <div className="flex items-center gap-1 rounded-ui-rect border border-gray-300 bg-white px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="24.99"
                  className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-gray-900 outline-none sm:text-[15px] ${errors.rate ? "text-red-600" : ""}`}
                  aria-label="기준 환율 1 PHP당 KRW"
                />
                <span className="shrink-0 text-[12px] text-gray-500 sm:text-[14px]">KRW</span>
              </div>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium text-gray-800 sm:text-[12px]">
                기준 환율 + (가산)
              </label>
              <div className="flex items-center gap-1 rounded-ui-rect border border-gray-300 bg-white px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
                <span className="shrink-0 text-[14px] text-gray-500 sm:text-[15px]">+</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={ratePlus}
                  onChange={(e) => setRatePlus(e.target.value.replace(/[^0-9.-]/g, ""))}
                  placeholder="0"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] font-semibold text-gray-900 outline-none sm:text-[15px]"
                  aria-label="기준 환율 가산"
                />
              </div>
            </div>
          </div>
          {baseRateValue > 0 && (
            <p className="mt-2 text-[12px] text-gray-600 sm:text-[13px]">
              <strong className="text-gray-900">1 PHP = {baseRateValue.toFixed(2)} KRW</strong>
              {ratePlusValue !== 0 && <span className="ml-1.5 font-semibold text-gray-900">+{ratePlusValue}</span>}
            </p>
          )}
          {errors.rate && <p className="mt-1 text-[13px] text-red-500">{errors.rate}</p>}

          <p className="mt-4 mb-2 text-[14px] font-medium text-gray-800">금액 (페소)</p>
          <div className="flex items-center gap-2 rounded-ui-rect border border-gray-300 bg-white px-3 py-2.5">
            <span className="text-[14px] text-gray-500">{CURRENCY_SYMBOLS.PHP}</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatPriceInput(e.target.value))}
              placeholder="0"
              className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-gray-900 outline-none ${errors.amount ? "text-red-600" : ""}`}
            />
          </div>
          {errors.amount && <p className="mt-1 text-[13px] text-red-500">{errors.amount}</p>}
        </section>

        {/* 페소 팝니다: 구매자 준비물만 / 페소 삽니다: 판매자+구매자 */}
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          {direction === "buy" && (
            <>
              <p className="mb-2 text-[14px] font-medium text-gray-800">판매자 준비물</p>
              <p className="mb-2 text-[12px] leading-relaxed text-gray-500">
                페소를 파는 분이 갖춰야 할 항목을 선택해 주세요.
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {PREP_OPTIONS.map((opt) => {
                  const disabled = isOtherPrepDisabled(sellerPrep, opt.value);
                  return (
                    <label
                      key={`seller-${opt.value}`}
                      className={`flex items-center gap-1.5 rounded-ui-rect border px-3 py-2 ${disabled ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60" : "cursor-pointer border-gray-200"}`}
                    >
                      <input
                        type="checkbox"
                        checked={sellerPrep.includes(opt.value)}
                        disabled={disabled}
                        onChange={() => togglePrep(setSellerPrep, opt.value)}
                        className="rounded border-gray-300"
                      />
                      <span className={`text-[13px] ${disabled ? "text-gray-400" : "text-gray-700"}`}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <p className="mb-2 text-[14px] font-medium text-gray-800">구매자 준비물</p>
          <p className="mb-2 text-[12px] leading-relaxed text-gray-500">
            {direction === "sell"
              ? "페소를 사는 분이 준비할 항목을 선택해 주세요."
              : "내가(페소 구매자) 준비할 항목을 선택해 주세요."}
          </p>
          <div className="flex flex-wrap gap-2">
            {PREP_OPTIONS.map((opt) => {
              const disabled = isOtherPrepDisabled(buyerPrep, opt.value);
              return (
                <label
                  key={`buyer-${opt.value}`}
                  className={`flex items-center gap-1.5 rounded-ui-rect border px-3 py-2 ${disabled ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60" : "cursor-pointer border-gray-200"}`}
                >
                  <input
                    type="checkbox"
                    checked={buyerPrep.includes(opt.value)}
                    disabled={disabled}
                    onChange={() => togglePrep(setBuyerPrep, opt.value)}
                    className="rounded border-gray-300"
                  />
                  <span className={`text-[13px] ${disabled ? "text-gray-400" : "text-gray-700"}`}>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {errors.prep && <p className="mt-2 text-[13px] text-red-500">{errors.prep}</p>}
        </section>
        </div>

        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <p className="mb-2 text-[14px] font-medium text-gray-800">추가 안내 (선택)</p>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            readOnly={coreLocked || showDescriptionAppend}
            placeholder="매너와 속도가 중요해요. 거래 시 유의사항을 적어주세요."
            rows={3}
            className="w-full resize-none rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[14px] text-gray-900"
          />
          <p className="mt-1 text-[12px] text-gray-500">매너와 속도가 중요해요.</p>
          {showDescriptionAppend ? (
            <div className="mt-3">
              <label className="mb-1 block text-[13px] text-gray-700">추가 안내 덧붙이기</label>
              <textarea
                value={descriptionAppend}
                onChange={(e) => setDescriptionAppend(e.target.value)}
                placeholder="협의·진행 중 안내할 내용만 입력해 주세요."
                rows={2}
                className="w-full resize-none rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[14px] text-gray-900"
              />
            </div>
          ) : null}
        </section>

        {errors.submit && <p className="px-4 py-2 text-[13px] text-red-500">{errors.submit}</p>}

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

"use client";

/**
 * Exchange write profile body — NOT a product entry.
 * Mount only via TradeWriteForm → TradeMarketplaceWriteFormInner (profileId === "exchange").
 * The marketplace shell owns page chrome, chrome widget placement, and submit;
 * this body keeps exchange-specific rate/prep extras, draft staging, and validation.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import {
  peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
  scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
} from "@/lib/navigation/trade-meet-spot-return-to";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import {
  tradeMeetSpotFromMetaSnapshot,
  buildTradeMeetSpotMetaForPersist,
  type TradeMeetSpotValue,
} from "@/lib/posts/trade-meet-spot-types";
import { inferTradeRegionCityFromMeetSpot } from "@/lib/posts/infer-trade-region-from-meet-spot";
import {
  clearTradeMeetSpotPickResult,
  clearTradeMeetSpotSessionNavigationState,
  consumeTradeMeetSpotPickResult,
  peekTradeMeetSpotPickResult,
} from "@/lib/posts/trade-meet-spot-pick-storage";
import {
  consumeTradeMeetSpotFocusOnReturn,
  restoreTradeMeetSpotReturnScrollPosition,
  scrollTradeMeetSpotAnchorIntoView,
} from "@/lib/posts/trade-meet-spot-anchor-scroll";
import {
  clearExchangeWriteMeetSpotStaging,
  consumeExchangeWriteMeetSpotStaging,
  peekExchangeWriteMeetSpotStaging,
  persistExchangeWriteBeforeMeetSpot,
  stripExchangeWriteMeetSpotSessionMirror,
  type ExchangeWriteMeetSpotStagingV1,
} from "@/lib/posts/jobs-exchange-write-meet-spot-staging";
import {
  exchangeMeetSpotStagingLooksMeaningful,
  exchangeWriteSessionDraftLooksMeaningful,
} from "@/lib/posts/jobs-exchange-write-draft-signal";
import { consumeTradeWriteRestoreAfterAddressFlag, setTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import { discardTradeWriteStashedDraft } from "@/lib/posts/trade-write-exit-cleanup";
import { formatPriceInput } from "@/lib/utils/format";
import {
  CURRENCY_SYMBOLS,
  DEFAULT_RATES_PHP_BASE,
  PREP_OPTIONS,
} from "@/lib/exchange/form-options";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { MobileDualActionBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { resolveTradeWriteCategoryId } from "../../shared/WriteTradeTopicSection";
import {
  TRADE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_INPUT_REGION_BAR,
  TRADE_WRITE_FB_INPUT_REGION_TITLE,
  TRADE_WRITE_FB_FIELD_HEAD,
} from "@/lib/ui/trade-write-fb-ui";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { resolveTradeCompositionForCategory } from "@/lib/trade/category-form/resolve-for-category";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import {
  GenericTradeWriteFields,
  validateAdaptedCompositionValues,
} from "@/components/write/trade/generic/GenericTradeWriteFields";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import type { TradeFieldValueBag } from "@/lib/trade/category-form/field-value-bridge";
import type {
  TradeExtendedWriteController,
  TradeWriteChromeState,
} from "@/lib/trade/category-form/extended-write-controller";

/**
 * Exchange Write — rate card / prep / memo stay shell (derived UX + multi-select).
 * Composition still owns validation via exchangeAdaptedFields + exchangeFieldValues.
 */

interface ExchangeExtendedWriteFieldsProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  onMeaningfulTradeDraftChange?: (has: boolean) => void;
  suppressTier1Chrome?: boolean;
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
  tradePolicy?: TradePolicyClient | null;
  registerController?: (controller: TradeExtendedWriteController | null) => void;
  chrome: TradeWriteChromeState;
  /** UI-3 품목정보 — ROOT + child topic. Amount writer stays in this body. */
  itemInfoHeader?: ReactNode;
}


const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** 환전 카드 — 참고 띠·입력 행·금액 행 공통 (한 곳만 수정해 정렬·타이포 유지) */
const EXCHANGE_WRITE_REFERENCE_BAR_CLASS =
  "flex min-h-[40px] items-center justify-between gap-3 border-b border-sam-border-soft bg-sam-surface-muted px-3 py-2.5 text-sam-fg";
const EXCHANGE_WRITE_FIELD_LABEL_STACK_CLASS =
  "mb-1.5 flex min-h-[38px] flex-col justify-end gap-0.5";
const EXCHANGE_WRITE_FIELD_TITLE_CLASS = "text-[12px] font-semibold leading-[1.2] text-sam-fg";
const EXCHANGE_WRITE_FIELD_HINT_CLASS =
  "text-[11px] font-normal leading-[1.25] text-sam-muted";
const EXCHANGE_WRITE_INPUT_ROW_CLASS =
  "flex h-11 w-full items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3";
const EXCHANGE_WRITE_INPUT_CLASS =
  "min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-normal leading-none text-sam-fg outline-none placeholder:text-sam-meta";

function formatRatesCriteria(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const min = date.getMinutes();
  return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function buildExchangeTitle(
  direction: string,
  translate: (key: "exchange_write_dir_sell_php" | "exchange_write_dir_buy_php") => string
): string {
  return direction === "sell" ? translate("exchange_write_dir_sell_php") : translate("exchange_write_dir_buy_php");
}

export function ExchangeExtendedWriteFields({
  category,
  onMeaningfulTradeDraftChange,
  editPostId,
  ownerEditSnapshot,
  tradePolicy = null,
  registerController,
  chrome,
  itemInfoHeader,
}: ExchangeExtendedWriteFieldsProps) {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const tradeWriteSheetEpoch = tradeWriteSheet?.openEpoch ?? 0;
  /** 환전 전용 폼은 거래 지역 필수. exchange 카테고리 DB 설정에 has_location=false가 있어도 항상 표시 */
  const hasLocation = true;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const coreLocked = Boolean(editPostId && tradePolicy && !tradePolicy.allowEditCore);
  const showDescriptionAppend = Boolean(editPostId && tradePolicy?.allowAppendOnlyDescription);
  const {
    description: memo,
    setDescription: setMemo,
    descriptionAppend,
    setDescriptionAppend,
    images,
    setImages,
    region,
    city,
    setRegion,
    setCity,
    syncTradeRegionCity,
    tradeTopicChildId,
    setTradeTopicChildId,
    tradeMeetSpot,
    setTradeMeetSpot,
    tradeAddressSsot,
    setTradeAddressSsot,
    setChromeErrors,
  } = chrome;

  const [direction, setDirection] = useState<"sell" | "buy">("sell");
  const [liveRates, setLiveRates] = useState<ExchangeRates | null>(null);
  const [ratesFetchedAt, setRatesFetchedAt] = useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [rate, setRate] = useState("");
  const [ratePlus, setRatePlus] = useState("0");
  const [amount, setAmount] = useState("");
  const effectiveTradeRegionId = useMemo(() => {
    return region.trim();
  }, [region]);

  const effectiveTradeCityId = useMemo(() => {
    return city.trim();
  }, [city]);

  const applyMeetSpotPick = useCallback(
    (next: TradeMeetSpotValue) => {
      setTradeMeetSpot(next);
      const loc = inferTradeRegionCityFromMeetSpot(next);
      if (loc) syncTradeRegionCity(loc.regionId, loc.cityId);
    },
    [syncTradeRegionCity]
  );
  const pendingMeetSpotFocusRef = useRef(false);
  /** 같은 카테고리로 지도 복귀(remount) 시 토픽을 지우지 않음 — `useLayoutEffect` 스테이징 복원 직후 초기화 금지 */
  const prevExchangeCategoryIdRef = useRef<string | null>(null);
  const [draftResumeGate, setDraftResumeGate] = useState<"pending_choice" | "ready">("ready");

  const [sellerPrep, setSellerPrep] = useState<string[]>([]);
  const [buyerPrep, setBuyerPrep] = useState<string[]>([]);

  const exchangeComposition = useMemo(
    () => resolveTradeCompositionForCategory(category),
    [category]
  );
  const exchangeAdaptedFields = useMemo(
    () => applyTradeBehaviorAdapter(exchangeComposition, { exchangeDirection: direction }),
    [exchangeComposition, direction]
  );
  const exchangeGenericFields = useMemo(
    () => exchangeAdaptedFields.filter((f) => f.id === "exchange_direction"),
    [exchangeAdaptedFields]
  );

  useEffect(() => {
    const prev = prevExchangeCategoryIdRef.current;
    prevExchangeCategoryIdRef.current = category.id;
    if (prev !== null && prev !== category.id) {
      setTradeTopicChildId("");
    }
  }, [category.id]);

  const applyExchangeStagingToForm = useCallback((staged: ExchangeWriteMeetSpotStagingV1) => {
    setDirection(staged.direction === "buy" ? "buy" : "sell");
    setRate(staged.rate);
    setRatePlus(staged.ratePlus);
    setAmount(staged.amount);
    setRatesFetchedAt(staged.ratesFetchedAt);
    setSellerPrep(staged.sellerPrep);
    setBuyerPrep(staged.buyerPrep);
    setMemo(staged.memo);
    setDescriptionAppend(staged.descriptionAppend);
    setRegion(staged.region);
    setCity(staged.city);
    setTradeTopicChildId(staged.tradeTopicChildId);
    setImages(staged.imageUrls.filter(Boolean).map((url) => ({ url })));
  }, []);

  useLayoutEffect(() => {
    if (editPostId) return;
    const skipDraftPrompt = peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
    if (skipDraftPrompt) {
      scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
    }
    const shouldRestore = consumeTradeWriteRestoreAfterAddressFlag(category.id);
    const hasMeetSpotReturn = peekTradeMeetSpotPickResult() != null;
    if (skipDraftPrompt || shouldRestore || hasMeetSpotReturn) {
      const staged = peekExchangeWriteMeetSpotStaging(category.id);
      if (staged) {
        applyExchangeStagingToForm(staged);
        stripExchangeWriteMeetSpotSessionMirror(category.id);
      }
      setDraftResumeGate("ready");
      return;
    }
    const peeked = peekExchangeWriteMeetSpotStaging(category.id);
    if (!peeked || !exchangeMeetSpotStagingLooksMeaningful(peeked)) {
      if (peeked && !exchangeMeetSpotStagingLooksMeaningful(peeked)) {
        clearExchangeWriteMeetSpotStaging(category.id);
      }
      setDraftResumeGate("ready");
      return;
    }
    setDraftResumeGate("pending_choice");
  }, [editPostId, category.id, pathname, tradeWriteSheetEpoch, applyExchangeStagingToForm]);

  useLayoutEffect(() => {
    const shouldFocusOnReturn = consumeTradeMeetSpotFocusOnReturn();
    const next = peekTradeMeetSpotPickResult();
    if (next) {
      applyMeetSpotPick(next);
      requestAnimationFrame(() => {
        clearTradeMeetSpotPickResult();
      });
    }
    if (shouldFocusOnReturn) pendingMeetSpotFocusRef.current = true;
    else restoreTradeMeetSpotReturnScrollPosition();
  }, [pathname, tradeWriteSheetEpoch, category.id, applyMeetSpotPick]);

  useEffect(() => {
    if (!pendingMeetSpotFocusRef.current) return;
    const run = () => scrollTradeMeetSpotAnchorIntoView();
    requestAnimationFrame(() => requestAnimationFrame(run));
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

    setImages((ownerEditSnapshot.images ?? []).filter(Boolean).map((url) => ({ url })));
    const rawMeta = ownerEditSnapshot.meta;
    const ts =
      rawMeta && typeof rawMeta === "object" && rawMeta !== null
        ? (rawMeta as Record<string, unknown>).trade_meet_spot
        : null;
    setTradeMeetSpot(tradeMeetSpotFromMetaSnapshot(ts));
  }, [editPostId, ownerEditSnapshot]);

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

  const exchangeFieldValues = useMemo((): TradeFieldValueBag => {
    return {
      exchange_direction: direction,
      from_currency: "PHP",
      to_currency: "KRW",
      exchange_rate_base: String(baseRateValue),
      exchange_rate_plus: ratePlus,
      exchange_rate: String(rateValue),
      amount,
      converted_amount: String(converted),
      seller_prep: sellerPrep.length > 0 ? "1" : "",
      buyer_prep: buyerPrep.length > 0 ? "1" : "",
      description: memo,
    };
  }, [
    direction,
    baseRateValue,
    ratePlus,
    rateValue,
    amount,
    converted,
    sellerPrep,
    buyerPrep,
    memo,
  ]);

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

  const handleResumeExchangePersistedDraft = useCallback(() => {
    const staged = consumeExchangeWriteMeetSpotStaging(category.id);
    if (!staged) return;
    applyExchangeStagingToForm(staged);
    setDraftResumeGate("ready");
  }, [category.id, applyExchangeStagingToForm]);

  const handleDiscardExchangePersistedDraft = useCallback(() => {
    if (editPostId) return;
    discardTradeWriteStashedDraft(category.id);
    setDraftResumeGate("ready");
    setDirection("sell");
    setRate("");
    setRatePlus("0");
    setAmount("");
    setRatesFetchedAt(null);
    setSellerPrep([]);
    setBuyerPrep([]);
    setMemo("");
    setDescriptionAppend("");
    setRegion("");
    setCity("");
    setTradeTopicChildId("");
    setImages([]);
    setTradeMeetSpot(null);
    setErrors({});
  }, [category.id, editPostId]);

  const meaningfulTradeDraftForSheet = useMemo(
    () =>
      editPostId
        ? false
        : draftResumeGate === "pending_choice" ||
          exchangeWriteSessionDraftLooksMeaningful({
            editPostId,
            amount,
            memo,
            descriptionAppend,
            tradeTopicChildId,
            images,
            sellerPrep,
            buyerPrep,
            tradeMeetSpot,
            ratePlus,
          }),
    [
      draftResumeGate,
      editPostId,
      amount,
      memo,
      descriptionAppend,
      tradeTopicChildId,
      images,
      sellerPrep,
      buyerPrep,
      tradeMeetSpot,
      ratePlus,
    ]
  );

  useEffect(() => {
    if (!onMeaningfulTradeDraftChange) return;
    onMeaningfulTradeDraftChange(meaningfulTradeDraftForSheet);
    return () => onMeaningfulTradeDraftChange(false);
  }, [meaningfulTradeDraftForSheet, onMeaningfulTradeDraftChange]);

  /** 지도·주소 관리 이동 직전 공통 — 일반 거래 `TradeWriteForm` 세션 초안과 동일 역할 */
  const persistExchangeFormStagingIfNeeded = useCallback(
    async (opts?: { markRestoreAfterSubflow?: boolean }): Promise<boolean> => {
    const user = getCurrentUser();
    let workingImages = [...images];
    const files = workingImages.map((x) => x.file).filter((f): f is File => !!f);
    if (files.length > 0) {
      if (!user?.id) {
        await dibayAlert({ title: t("trade_056") });
        return false;
      }
      const uploaded = await uploadPostImages(files, user.id);
      if (uploaded.length !== files.length) {
        await dibayAlert({
          title: t("trade_write_err_upload_partial", {
            total: String(files.length),
            uploaded: String(uploaded.length),
          }),
        });
        return false;
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
    const imageUrls = workingImages
      .map((i) => i.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0 && !u.startsWith("blob:"));
    persistExchangeWriteBeforeMeetSpot(category.id, {
      direction,
      rate,
      ratePlus,
      amount,
      ratesFetchedAt,
      sellerPrep,
      buyerPrep,
      memo,
      descriptionAppend,
      region,
      city,
      tradeTopicChildId,
      imageUrls,
    });
    if (opts?.markRestoreAfterSubflow) {
      setTradeWriteRestoreAfterAddressFlag(category.id);
    }
    return true;
  }, [
    category.id,
    images,
    direction,
    rate,
    ratePlus,
    amount,
    ratesFetchedAt,
    sellerPrep,
    buyerPrep,
    memo,
    descriptionAppend,
    region,
    city,
    tradeTopicChildId,
  ]);

  useEffect(() => {
    if (!tradeWriteSheet) return;
    const ref = tradeWriteSheet.persistSnapshotBeforeLeaveRef;
    ref.current = async () => {
      if (editPostId) return;
      await persistExchangeFormStagingIfNeeded();
    };
    return () => {
      ref.current = null;
    };
  }, [tradeWriteSheet, editPostId, persistExchangeFormStagingIfNeeded]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (rateValue <= 0 || Number.isNaN(rateValue)) {
      next.rate = t("exchange_write_err_rate");
    }
    if (!amount.trim() || Number.isNaN(Number(amount.replace(/,/g, ""))) || Number(amount.replace(/,/g, "")) <= 0) {
      next.amount = t("exchange_write_err_amount");
    }
    if (direction === "sell") {
      if (buyerPrep.length === 0) {
        next.prep = t("exchange_write_err_buyer_prep");
      }
    } else if (sellerPrep.length === 0 || buyerPrep.length === 0) {
      next.prep = t("exchange_write_err_both_prep");
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
    const compErrs = validateAdaptedCompositionValues(
      exchangeAdaptedFields,
      exchangeFieldValues,
      (fieldId) => {
        const label = tradeFieldAdminLabel(fieldId, language === "en" ? "en" : "ko");
        return language === "en" ? `Enter ${label}` : `${label}을(를) 입력해 주세요`;
      }
    );
    const EX_COMP_TO_FORM: Record<string, string> = {
      exchange_rate: "rate",
      amount: "amount",
      buyer_prep: "prep",
      seller_prep: "prep",
      description: "memo",
    };
    for (const [fieldId, msg] of Object.entries(compErrs)) {
      const formKey = EX_COMP_TO_FORM[fieldId] ?? fieldId;
      if (!next[formKey]) next[formKey] = msg;
    }
    setErrors(next);
    setChromeErrors({
      location: next.location ?? "",
      meetSpot: next.meetSpot ?? "",
      description: next.memo ?? "",
    });
    return Object.keys(next).length === 0;
  }, [
    rateValue,
    amount,
    direction,
    sellerPrep.length,
    buyerPrep.length,
    hasLocation,
    effectiveTradeRegionId,
    effectiveTradeCityId,
    tradeAddressSsot,
    exchangeAdaptedFields,
    exchangeFieldValues,
    language,
    t,
    setChromeErrors,
  ]);

  const buildPayload = useCallback(
    (imageUrls: string[] | undefined) => {
      const title = buildExchangeTitle(direction, t);
      const content = memo.trim() || t("exchange_write_default_memo");
      let meta: Record<string, unknown> = {
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
      const submitRegion = effectiveTradeRegionId.trim();
      const submitCity = effectiveTradeCityId.trim();
      if (hasLocation) {
        const meetMeta = buildTradeMeetSpotMetaForPersist(tradeMeetSpot);
        if (meetMeta) meta = { ...meta, ...meetMeta };
      }
      return {
        type: "trade" as const,
        categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
        title,
        content,
        price: amountValue,
        imageUrls,
        region: submitRegion || undefined,
        city: submitCity || undefined,
        tradeLguId: tradeAddressSsot.tradeLguId ?? undefined,
        meta,
      };
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
      effectiveTradeRegionId,
      effectiveTradeCityId,
      tradeAddressSsot,
      tradeMeetSpot,
      hasLocation,
      t,
    ]
  );

  useEffect(() => {
    registerController?.({
      validate,
      getImages: () => images,
      buildPayload,
      getDescriptionAppend: () =>
        showDescriptionAppend && descriptionAppend.trim() ? descriptionAppend.trim() : undefined,
      clearStagingAfterSuccess: () => {
        clearExchangeWriteMeetSpotStaging(category.id);
        clearTradeMeetSpotSessionNavigationState();
      },
      getSubmitErrorFallbackPath: () =>
        pathname || (editPostId ? `/products/${editPostId}/edit` : `/write/${category.slug}`),
      persistStagingIfNeeded: persistExchangeFormStagingIfNeeded,
    });
    return () => registerController?.(null);
  }, [
    registerController,
    validate,
    images,
    buildPayload,
    showDescriptionAppend,
    descriptionAppend,
    category.id,
    category.slug,
    pathname,
    editPostId,
    persistExchangeFormStagingIfNeeded,
  ]);

  /** 참고 시세 한 줄용 — API·정적 기준만(작성 중 입력값과 무관). 로딩 여부는 UI에서만 분기 */
  const referenceKrwMid = useMemo(
    () =>
      liveRates?.KRW && liveRates.KRW > 0 ? liveRates.KRW : DEFAULT_RATES_PHP_BASE.KRW,
    [liveRates]
  );

  return (
    <>
      <MobileDualActionBottomSheet
        open={draftResumeGate === "pending_choice"}
        onClose={() => {}}
        title={t("trade_099")}
        description={t("trade_write_draft_resume_body")}
        secondaryLabel={t("trade_write_draft_resume_new")}
        onSecondary={handleDiscardExchangePersistedDraft}
        primaryLabel={t("trade_write_draft_resume_continue")}
        onPrimary={handleResumeExchangePersistedDraft}
        primaryTone="primary"
        zIndexClass="z-[72]"
        ariaLabel={t("exchange_write_draft_aria")}
        interactionMode="blocking"
      />
        <section data-ui3-slot="title" className={TRADE_WRITE_FB_SECTION}>
          <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_write_title")}</h4>
          <p className="mt-0.5 min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5 text-[15px] text-sam-fg">
            {buildExchangeTitle(direction, t)}
          </p>
        </section>

        <section data-ui3-slot="price" className={TRADE_WRITE_FB_SECTION}>
          <label
            className={`mb-1.5 block ${EXCHANGE_WRITE_FIELD_TITLE_CLASS} leading-tight`}
            htmlFor="exchange-write-amount-php"
          >
            {t("exchange_write_amount_php")}
          </label>
          <div className={EXCHANGE_WRITE_INPUT_ROW_CLASS}>
            <span className="shrink-0 text-[15px] font-medium text-sam-muted">{CURRENCY_SYMBOLS.PHP}</span>
            <input
              id="exchange-write-amount-php"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatPriceInput(e.target.value))}
              placeholder="0"
              className={`${EXCHANGE_WRITE_INPUT_CLASS} ${errors.amount ? "text-red-600" : ""}`}
            />
          </div>
          {errors.amount ? (
            <p className="mt-1 sam-text-body-secondary text-red-500">{errors.amount}</p>
          ) : null}
        </section>

        {itemInfoHeader}

        <div className={TRADE_WRITE_FB_INPUT_REGION_BAR}>
          <p className={TRADE_WRITE_FB_INPUT_REGION_TITLE}>{t("trade_010")}</p>
          <p className="mt-1 text-[12px] font-normal normal-case tracking-normal text-sam-muted">
            {t("exchange_write_intro_hint")}
          </p>
        </div>

        <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
        {/* 팝니다 = 페소 팝니다 / 삽니다 = 페소 삽니다. 금액은 항상 페소. */}
        <section className={TRADE_WRITE_FB_SECTION}>
          <GenericTradeWriteFields
            fields={exchangeGenericFields}
            values={exchangeFieldValues}
            onChange={(fieldId, value) => {
              if (fieldId === "exchange_direction") {
                setDirection(value === "buy" ? "buy" : "sell");
              }
            }}
            disabled={coreLocked}
          />
        </section>

        {/* 참고 시세(요약) + 기준/가산 입력 + 적용 환율 + 페소 금액 — 한 카드 (열·행 정렬·타이포 통일) */}
        <section className={TRADE_WRITE_FB_SECTION}>
          <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_130")}</h4>
          <div className="mt-1 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
            <div className={EXCHANGE_WRITE_REFERENCE_BAR_CLASS}>
              <span className="shrink-0 text-[12px] font-semibold leading-none tracking-tight">
                {t("exchange_write_reference_rate")}
              </span>
              <span className="min-w-0 text-right font-mono text-[12px] font-medium leading-snug tabular-nums text-sam-fg">
                {ratesLoading ? (
                  <span className="text-sam-muted">{t("trade_103")}</span>
                ) : (
                  <span className="inline-flex flex-col items-end gap-0.5 sm:flex-row sm:items-baseline sm:gap-1.5">
                    <span className="text-sam-fg">
                      1 PHP ≈ {referenceKrwMid.toFixed(2)} ₩
                    </span>
                    {ratesFetchedAt ? (
                      <span className="text-[11px] font-normal tabular-nums text-sam-muted">
                        {ratesFetchedAt}
                      </span>
                    ) : null}
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-4 p-3">
              <div className="grid grid-cols-2 gap-x-3 gap-y-0">
                <div className="flex min-w-0 flex-col">
                  <div className={EXCHANGE_WRITE_FIELD_LABEL_STACK_CLASS}>
                    <span className={EXCHANGE_WRITE_FIELD_TITLE_CLASS}>{t("trade_046")}</span>
                    <span className={EXCHANGE_WRITE_FIELD_HINT_CLASS}>{t("trade_002")}</span>
                  </div>
                  <div className={EXCHANGE_WRITE_INPUT_ROW_CLASS}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="24.99"
                      className={`${EXCHANGE_WRITE_INPUT_CLASS} ${errors.rate ? "text-red-600" : ""}`}
                      aria-label={t("trade_047")}
                    />
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-sam-muted">₩</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className={EXCHANGE_WRITE_FIELD_LABEL_STACK_CLASS}>
                    <span className={EXCHANGE_WRITE_FIELD_TITLE_CLASS}>{t("trade_009")}</span>
                    <span className={EXCHANGE_WRITE_FIELD_HINT_CLASS}>{t("trade_049")}</span>
                  </div>
                  <div className={EXCHANGE_WRITE_INPUT_ROW_CLASS}>
                    <span className="shrink-0 text-[15px] font-medium leading-none text-sam-muted">+</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={ratePlus}
                      onChange={(e) => setRatePlus(e.target.value.replace(/[^0-9.-]/g, ""))}
                      placeholder="0"
                      className={EXCHANGE_WRITE_INPUT_CLASS}
                      aria-label={t("trade_048")}
                    />
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-sam-muted">₩</span>
                  </div>
                </div>
              </div>

              <div className="rounded-ui-rect bg-sam-surface-muted px-3 py-3">
                <p className="text-center text-[12px] font-semibold leading-tight text-sam-muted">{t("trade_100")}</p>
                <p className="mt-1.5 text-center text-[15px] font-semibold tabular-nums leading-snug tracking-tight text-sam-fg">
                  {rateValue > 0 && !Number.isNaN(rateValue)
                    ? `1 PHP = ${rateValue.toFixed(2)} KRW`
                    : "1 PHP = —"}
                </p>
                {ratePlusValue !== 0 && baseRateValue > 0 && !Number.isNaN(baseRateValue) ? (
                  <p className="mt-1.5 text-center text-[11px] font-normal tabular-nums leading-snug text-sam-muted">
                    {t("exchange_write_rate_base_plus", {
                      base: baseRateValue.toFixed(2),
                      plus: `${ratePlusValue >= 0 ? "+" : ""}${ratePlusValue}`,
                    })}
                  </p>
                ) : null}
              </div>

              {errors.rate ? (
                <p className="sam-text-body-secondary text-red-500">{errors.rate}</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* 페소 팝니다: 구매자 준비물만 / 페소 삽니다: 판매자+구매자 */}
        <section className={TRADE_WRITE_FB_SECTION}>
          {direction === "buy" && (
            <>
              <p className="mb-2 sam-text-body font-medium text-sam-fg">{t("trade_125")}</p>
              <p className="mb-2 sam-text-helper leading-relaxed text-sam-muted">
                {t("exchange_write_seller_prep_hint")}
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {PREP_OPTIONS.map((opt) => {
                  const disabled = isOtherPrepDisabled(sellerPrep, opt.value);
                  return (
                    <label
                      key={`seller-${opt.value}`}
                      className={`flex items-center gap-1.5 rounded-ui-rect border px-3 py-2 ${disabled ? "cursor-not-allowed border-sam-border-soft bg-sam-app opacity-60" : "cursor-pointer border-sam-border"}`}
                    >
                      <input
                        type="checkbox"
                        checked={sellerPrep.includes(opt.value)}
                        disabled={disabled}
                        onChange={() => togglePrep(setSellerPrep, opt.value)}
                        className="rounded border-sam-border"
                      />
                      <span className={`sam-text-body-secondary ${disabled ? "text-sam-meta" : "text-sam-fg"}`}>{t(opt.labelKey)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <p className="mb-2 sam-text-body font-medium text-sam-fg">{t("trade_032")}</p>
          <p className="mb-2 sam-text-helper leading-relaxed text-sam-muted">
            {direction === "sell"
              ? t("exchange_write_buyer_prep_sell")
              : t("exchange_write_buyer_prep_buy")}
          </p>
          <div className="flex flex-wrap gap-2">
            {PREP_OPTIONS.map((opt) => {
              const disabled = isOtherPrepDisabled(buyerPrep, opt.value);
              return (
                <label
                  key={`buyer-${opt.value}`}
                  className={`flex items-center gap-1.5 rounded-ui-rect border px-3 py-2 ${disabled ? "cursor-not-allowed border-sam-border-soft bg-sam-app opacity-60" : "cursor-pointer border-sam-border"}`}
                >
                  <input
                    type="checkbox"
                    checked={buyerPrep.includes(opt.value)}
                    disabled={disabled}
                    onChange={() => togglePrep(setBuyerPrep, opt.value)}
                    className="rounded border-sam-border"
                  />
                  <span className={`sam-text-body-secondary ${disabled ? "text-sam-meta" : "text-sam-fg"}`}>{t(opt.labelKey)}</span>
                </label>
              );
            })}
          </div>
          {errors.prep && <p className="mt-2 sam-text-body-secondary text-red-500">{errors.prep}</p>}
        </section>
        </div>

      {errors.submit && <p className="px-4 py-2 sam-text-body-secondary text-red-500">{errors.submit}</p>}
    </>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { updateTradePostFromCreatePayload } from "@/lib/posts/updateTradePost";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import {
  hrefTradeMeetSpotPick,
  peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
  resolveTradeMeetSpotReturnTo,
  scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
} from "@/lib/navigation/trade-meet-spot-return-to";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { fetchRepresentativeTradeMeetFallbackLine } from "@/lib/addresses/representative-trade-meet-fallback-line";
import {
  pickPersistableMeetSpotCoords,
  tradeMeetSpotFromMetaSnapshot,
  type TradeMeetSpotValue,
} from "@/lib/posts/trade-meet-spot-types";
import {
  clearTradeMeetSpotPickResult,
  clearTradeMeetSpotSessionNavigationState,
  consumeTradeMeetSpotPickResult,
  peekTradeMeetSpotPickResult,
  prepareTradeMeetSpotMapNavigation,
} from "@/lib/posts/trade-meet-spot-pick-storage";
import {
  TRADE_MEET_SPOT_SCROLL_ANCHOR_ID,
  consumeTradeMeetSpotFocusOnReturn,
  markTradeMeetSpotFocusOnReturn,
  persistTradeMeetSpotReturnScrollPosition,
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
import {
  ensureClientAccessOrRedirectAsync,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { getAppSettings } from "@/lib/app-settings";
import { formatPriceInput } from "@/lib/utils/format";
import {
  CURRENCY_SYMBOLS,
  DEFAULT_RATES_PHP_BASE,
  EXCHANGE_DIRECTION_OPTIONS,
  PREP_OPTIONS,
} from "@/lib/exchange/form-options";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { MobileDualActionBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "../useWriteScreenEmbeddedTier1";
import { AutoGrowTextarea } from "../shared/AutoGrowTextarea";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { TradeFrequentPhrasesSheet } from "../shared/TradeFrequentPhrasesSheet";
import { TradeDefaultLocationBlock } from "../shared/TradeDefaultLocationBlock";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";
import { APP_TRADE_WRITE_FORM_FB_STACK_CLASS } from "@/lib/ui/app-content-layout";
import {
  TRADE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_INPUT_REGION_BAR,
  TRADE_WRITE_FB_INPUT_REGION_TITLE,
  TRADE_WRITE_FB_FIELD_HEAD,
  TRADE_WRITE_FB_FIELD_LABEL,
} from "@/lib/ui/trade-write-fb-ui";
import { PHILIFE_FB_TEXTAREA_CLASS } from "@/lib/philife/philife-flat-ui-classes";

interface ExchangeWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  onMeaningfulTradeDraftChange?: (has: boolean) => void;
  suppressTier1Chrome?: boolean;
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
  tradePolicy?: TradePolicyClient | null;
}


const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** 환전 카드 — 참고 띠·입력 행·금액 행 공통 (한 곳만 수정해 정렬·타이포 유지) */
const EXCHANGE_WRITE_REFERENCE_BAR_CLASS =
  "flex min-h-[40px] items-center justify-between gap-3 bg-slate-800 px-3 py-2.5 text-white";
const EXCHANGE_WRITE_FIELD_LABEL_STACK_CLASS =
  "mb-1.5 flex min-h-[38px] flex-col justify-end gap-0.5";
const EXCHANGE_WRITE_FIELD_TITLE_CLASS = "text-[12px] font-semibold leading-[1.2] text-[#050505]";
const EXCHANGE_WRITE_FIELD_HINT_CLASS =
  "text-[11px] font-normal leading-[1.25] text-[#65676B]";
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

function buildExchangeTitle(direction: string): string {
  return direction === "sell" ? "페소 팝니다" : "페소 삽니다";
}

export function ExchangeWriteForm({
  category,
  onSuccess,
  onCancel,
  onMeaningfulTradeDraftChange,
  suppressTier1Chrome = false,
  editPostId,
  ownerEditSnapshot,
  tradePolicy = null,
}: ExchangeWriteFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const tradeWriteSheetEpoch = tradeWriteSheet?.openEpoch ?? 0;
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const appSettings = useMemo(() => getAppSettings(), []);
  const maxImages = Math.max(1, appSettings.maxProductImages ?? 10);
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
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [frequentPhrasesOpen, setFrequentPhrasesOpen] = useState(false);
  const [tradeMeetSpot, setTradeMeetSpot] = useState<TradeMeetSpotValue | null>(null);
  const [representativeTradeMeetFallbackLine, setRepresentativeTradeMeetFallbackLine] = useState<string | null>(
    null
  );
  const pendingMeetSpotFocusRef = useRef(false);
  /** 같은 카테고리로 지도 복귀(remount) 시 토픽을 지우지 않음 — `useLayoutEffect` 스테이징 복원 직후 초기화 금지 */
  const prevExchangeCategoryIdRef = useRef<string | null>(null);
  const [draftResumeGate, setDraftResumeGate] = useState<"pending_choice" | "ready">("ready");

  const [sellerPrep, setSellerPrep] = useState<string[]>([]);
  const [buyerPrep, setBuyerPrep] = useState<string[]>([]);
  const [memo, setMemo] = useState("");

  useEffect(() => {
    const prev = prevExchangeCategoryIdRef.current;
    prevExchangeCategoryIdRef.current = category.id;
    if (prev !== null && prev !== category.id) {
      setTradeTopicChildId("");
    }
  }, [category.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const line = await fetchRepresentativeTradeMeetFallbackLine();
      if (!cancelled) setRepresentativeTradeMeetFallbackLine(line);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setTradeMeetSpot(next);
      requestAnimationFrame(() => {
        clearTradeMeetSpotPickResult();
      });
    }
    if (shouldFocusOnReturn) pendingMeetSpotFocusRef.current = true;
    else restoreTradeMeetSpotReturnScrollPosition();
  }, [pathname, tradeWriteSheetEpoch, category.id]);

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
      if (next) setTradeMeetSpot(next);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

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

  const karrotMeetSpotDisplayLine = useMemo(() => {
    const fromMap = tradeMeetSpot?.displayLine?.trim();
    if (fromMap) return fromMap;
    const rep = representativeTradeMeetFallbackLine?.trim();
    if (rep) return rep;
    return getLocationLabelIfValid(region, city)?.trim() ?? "";
  }, [tradeMeetSpot, representativeTradeMeetFallbackLine, region, city]);

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
        window.alert("로그인이 필요합니다. 로그인 후 다시 시도해 주세요.");
        return false;
      }
      const uploaded = await uploadPostImages(files, user.id);
      if (uploaded.length !== files.length) {
        window.alert(
          `이미지 ${files.length}장 중 ${uploaded.length}장만 업로드되었습니다. 네트워크·저장소 설정을 확인한 뒤 다시 시도해 주세요.`
        );
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

  const handleBeforeNavigateToAddresses = useCallback(async () => {
    if (editPostId) return;
    const ok = await persistExchangeFormStagingIfNeeded({ markRestoreAfterSubflow: true });
    if (!ok) throw new Error("exchange-staging-aborted");
  }, [editPostId, persistExchangeFormStagingIfNeeded]);

  const handleBeforeMeetSpotPick = useCallback(async () => {
    const returnTo = tradeWriteSheet ? getCategoryHref(category) : resolveTradeMeetSpotReturnTo();
    if (!editPostId) {
      const ok = await persistExchangeFormStagingIfNeeded({ markRestoreAfterSubflow: true });
      if (!ok) return;
    }
    prepareTradeMeetSpotMapNavigation(tradeMeetSpot);
    persistTradeMeetSpotReturnScrollPosition();
    markTradeMeetSpotFocusOnReturn();
    router.push(hrefTradeMeetSpotPick(returnTo));
  }, [editPostId, tradeWriteSheet, category, persistExchangeFormStagingIfNeeded, tradeMeetSpot, router]);

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
    if (!tradeMeetSpot?.displayLine?.trim()) {
      const fallbackLine =
        representativeTradeMeetFallbackLine?.trim() || getLocationLabelIfValid(region, city)?.trim();
      if (!fallbackLine) {
        next.meetSpot = "거래 지역을 확인할 수 없습니다. 주소 관리에서 지역을 저장한 뒤 다시 시도해 주세요.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [
    rateValue,
    amount,
    direction,
    sellerPrep.length,
    buyerPrep.length,
    hasLocation,
    region,
    city,
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
        const files = images.map((i) => i.file).filter((f): f is File => !!f);
        const uploaded = files.length > 0 && user?.id ? await uploadPostImages(files, user.id) : [];
        const existingUrls = images
          .map((i) => i.url)
          .filter((u): u is string => typeof u === "string" && u.length > 0 && !u.startsWith("blob:"));
        const mergedImageUrls = [...existingUrls, ...uploaded];

        const title = buildExchangeTitle(direction);
        const content = memo.trim() || "환전 거래합니다. 매너와 속도가 중요해요.";
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
        const payload = {
          type: "trade" as const,
          categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
          title,
          content,
          price: amountValue,
          imageUrls: mergedImageUrls.length > 0 ? mergedImageUrls : undefined,
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
          if (res.ok) {
            clearExchangeWriteMeetSpotStaging(category.id);
            clearTradeMeetSpotSessionNavigationState();
            invalidateHomePostsCache();
            onSuccess(editPostId);
          } else {
            if (redirectForBlockedAction(router, res.error, pathname || `/products/${editPostId}/edit`)) return;
            setErrors({ submit: res.error });
          }
        } else {
          const res = await createPost(payload);
          if (res.ok) {
            clearExchangeWriteMeetSpotStaging(category.id);
            clearTradeMeetSpotSessionNavigationState();
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
      images,
      tradeMeetSpot,
      representativeTradeMeetFallbackLine,
    ]
  );

  const backHref = editPostId ? `/post/${editPostId}` : getCategoryHref(category);

  /** 참고 시세 한 줄용 — API·정적 기준만(작성 중 입력값과 무관). 로딩 여부는 UI에서만 분기 */
  const referenceKrwMid = useMemo(
    () =>
      liveRates?.KRW && liveRates.KRW > 0 ? liveRates.KRW : DEFAULT_RATES_PHP_BASE.KRW,
    [liveRates]
  );

  const tradeLocationEl = (
    <div id={TRADE_MEET_SPOT_SCROLL_ANCHOR_ID} className={coreLocked ? "pointer-events-none opacity-60" : ""}>
      <TradeDefaultLocationBlock
        editPostId={editPostId}
        region={region}
        city={city}
        onSyncRegionCity={syncTradeRegionCity}
        error={errors.location}
        readOnly={coreLocked}
        onBeforeNavigateToAddresses={!editPostId ? handleBeforeNavigateToAddresses : undefined}
        karrotMeetSpotUi={hasLocation}
        meetSpotLine={karrotMeetSpotDisplayLine || null}
        meetSpotError={errors.meetSpot}
        onBeforeMeetSpotPick={!coreLocked ? () => void handleBeforeMeetSpotPick() : undefined}
        meetSpotHeading="위치"
        denseLayout
      />
    </div>
  );

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
        onSecondary={handleDiscardExchangePersistedDraft}
        primaryLabel="이어쓰기"
        onPrimary={handleResumeExchangePersistedDraft}
        primaryTone="primary"
        zIndexClass="z-[72]"
        ariaLabel="환전 임시 저장 글 복구"
        interactionMode="blocking"
      />
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={editPostId ? `${category.name} · 수정` : `${category.name} · 글쓰기`}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <form onSubmit={handleSubmit} className={APP_TRADE_WRITE_FORM_FB_STACK_CLASS}>
        {tradePolicy?.hint ? (
          <div className="mt-0 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-950">
            {tradePolicy.hint}
          </div>
        ) : null}

        <div className={TRADE_WRITE_FB_INPUT_REGION_BAR}>
          <p className={TRADE_WRITE_FB_INPUT_REGION_TITLE}>거래 글 작성 · 직접 입력</p>
          <p className="mt-1 text-[12px] font-normal normal-case tracking-normal text-[#65676B]">
            사진·환율·금액·만남 장소 등 아래 내용만 글에 저장됩니다.
          </p>
        </div>

        <div className={TRADE_WRITE_FB_SECTION}>
          <ImageUploader
            value={images}
            onChange={setImages}
            maxCount={maxImages}
            label="사진"
            disabled={coreLocked}
            compact={false}
            variant="karrot"
          />
        </div>
        <div className={coreLocked ? "pointer-events-none opacity-60" : ""}>
        <div className={TRADE_WRITE_FB_SECTION}>
          <WriteTradeTopicSection
            category={category}
            value={tradeTopicChildId}
            onChange={setTradeTopicChildId}
          />
        </div>

        {/* 팝니다 = 페소 팝니다 / 삽니다 = 페소 삽니다. 금액은 항상 페소. */}
        <section className={TRADE_WRITE_FB_SECTION}>
          <div className="flex gap-2">
            {EXCHANGE_DIRECTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={coreLocked}
                onClick={() => setDirection(opt.value as "sell" | "buy")}
                className={`flex-1 rounded-ui-rect border py-2.5 sam-text-body font-medium ${
                  direction === opt.value ? "border-sam-border bg-sam-surface-dark text-white" : "border-sam-border bg-sam-surface text-sam-fg"
                }`}
              >
                {opt.value === "sell" ? "페소 팝니다" : "페소 삽니다"}
              </button>
            ))}
          </div>
        </section>

        {/* 참고 시세(요약) + 기준/가산 입력 + 적용 환율 + 페소 금액 — 한 카드 (열·행 정렬·타이포 통일) */}
        <section className={TRADE_WRITE_FB_SECTION}>
          <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>환율 · 금액</h4>
          <div className="mt-1 overflow-hidden rounded-ui-rect border border-slate-800 bg-white shadow-sm">
            <div className={EXCHANGE_WRITE_REFERENCE_BAR_CLASS}>
              <span className="shrink-0 text-[12px] font-semibold leading-none tracking-tight">
                참고 시세
              </span>
              <span className="min-w-0 text-right font-mono text-[12px] font-medium leading-snug tabular-nums text-slate-100">
                {ratesLoading ? (
                  <span className="text-slate-400">조회 중…</span>
                ) : (
                  <span className="inline-flex flex-col items-end gap-0.5 sm:flex-row sm:items-baseline sm:gap-1.5">
                    <span className="text-slate-50">
                      1 PHP ≈ {referenceKrwMid.toFixed(2)} ₩
                    </span>
                    {ratesFetchedAt ? (
                      <span className="text-[11px] font-normal tabular-nums text-slate-400">
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
                    <span className={EXCHANGE_WRITE_FIELD_TITLE_CLASS}>기준 환율</span>
                    <span className={EXCHANGE_WRITE_FIELD_HINT_CLASS}>1 PHP당 원화</span>
                  </div>
                  <div className={EXCHANGE_WRITE_INPUT_ROW_CLASS}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="24.99"
                      className={`${EXCHANGE_WRITE_INPUT_CLASS} ${errors.rate ? "text-red-600" : ""}`}
                      aria-label="기준 환율 1 PHP당 KRW"
                    />
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-sam-muted">₩</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className={EXCHANGE_WRITE_FIELD_LABEL_STACK_CLASS}>
                    <span className={EXCHANGE_WRITE_FIELD_TITLE_CLASS}>가산</span>
                    <span className={EXCHANGE_WRITE_FIELD_HINT_CLASS}>기준에 더할 ₩</span>
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
                      aria-label="기준 환율 가산"
                    />
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-sam-muted">₩</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-[#f0f2f5] px-3 py-3">
                <p className="text-center text-[12px] font-semibold leading-tight text-[#65676B]">적용 환율</p>
                <p className="mt-1.5 text-center text-[15px] font-semibold tabular-nums leading-snug tracking-tight text-[#050505]">
                  {rateValue > 0 && !Number.isNaN(rateValue)
                    ? `1 PHP = ${rateValue.toFixed(2)} KRW`
                    : "1 PHP = —"}
                </p>
                {ratePlusValue !== 0 && baseRateValue > 0 && !Number.isNaN(baseRateValue) ? (
                  <p className="mt-1.5 text-center text-[11px] font-normal tabular-nums leading-snug text-[#65676B]">
                    기준 {baseRateValue.toFixed(2)} + {ratePlusValue >= 0 ? "+" : ""}
                    {ratePlusValue}
                  </p>
                ) : null}
              </div>

              {errors.rate ? (
                <p className="sam-text-body-secondary text-red-500">{errors.rate}</p>
              ) : null}

              <div className="border-t border-[#e4e6eb] pt-1">
                <label
                  className={`mb-1.5 block ${EXCHANGE_WRITE_FIELD_TITLE_CLASS} leading-tight`}
                  htmlFor="exchange-write-amount-php"
                >
                  금액 (페소)
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
              </div>
            </div>
          </div>
        </section>

        {/* 페소 팝니다: 구매자 준비물만 / 페소 삽니다: 판매자+구매자 */}
        <section className={TRADE_WRITE_FB_SECTION}>
          {direction === "buy" && (
            <>
              <p className="mb-2 sam-text-body font-medium text-sam-fg">판매자 준비물</p>
              <p className="mb-2 sam-text-helper leading-relaxed text-sam-muted">
                페소를 파는 분이 갖춰야 할 항목을 선택해 주세요.
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
                      <span className={`sam-text-body-secondary ${disabled ? "text-sam-meta" : "text-sam-fg"}`}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <p className="mb-2 sam-text-body font-medium text-sam-fg">구매자 준비물</p>
          <p className="mb-2 sam-text-helper leading-relaxed text-sam-muted">
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
                  className={`flex items-center gap-1.5 rounded-ui-rect border px-3 py-2 ${disabled ? "cursor-not-allowed border-sam-border-soft bg-sam-app opacity-60" : "cursor-pointer border-sam-border"}`}
                >
                  <input
                    type="checkbox"
                    checked={buyerPrep.includes(opt.value)}
                    disabled={disabled}
                    onChange={() => togglePrep(setBuyerPrep, opt.value)}
                    className="rounded border-sam-border"
                  />
                  <span className={`sam-text-body-secondary ${disabled ? "text-sam-meta" : "text-sam-fg"}`}>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {errors.prep && <p className="mt-2 sam-text-body-secondary text-red-500">{errors.prep}</p>}
        </section>
        </div>

        {tradeLocationEl}

        <section className={TRADE_WRITE_FB_SECTION}>
          <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>
            내용 <span className="font-normal text-[#8a8d91]">(선택)</span>
          </h4>
          <AutoGrowTextarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            readOnly={coreLocked || showDescriptionAppend}
            placeholder=""
            className={`w-full ${PHILIFE_FB_TEXTAREA_CLASS} mt-0.5 min-h-[100px] rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[15px] text-[#050505] outline-none placeholder:text-[#8a8d91] focus:border-sam-primary`}
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
                  setMemo((d) => (d.trim() ? `${d}\n\n${text}` : text));
                }}
              />
            </>
          ) : null}
          <p className="mt-1 text-[12px] text-[#8a8d91]">비워 두면 기본 문구로 저장돼요.</p>
          {showDescriptionAppend ? (
            <div className="mt-2 border-t border-[#e4e6eb] pt-2">
              <label className={TRADE_WRITE_FB_FIELD_LABEL}>추가 안내 덧붙이기</label>
              <AutoGrowTextarea
                value={descriptionAppend}
                onChange={(e) => setDescriptionAppend(e.target.value)}
                placeholder=""
                className={`mt-0.5 w-full ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[80px] rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[15px] outline-none focus:border-sam-primary`}
              />
            </div>
          ) : null}
        </section>

        {errors.submit && <p className="px-4 py-2 sam-text-body-secondary text-red-500">{errors.submit}</p>}

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

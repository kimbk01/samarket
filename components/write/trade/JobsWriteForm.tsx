"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import {
  hrefTradeMeetSpotPick,
  peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
  resolveTradeMeetSpotReturnTo,
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
  clearJobsWriteMeetSpotStaging,
  consumeJobsWriteMeetSpotStaging,
  peekJobsWriteMeetSpotStaging,
  persistJobsWriteBeforeMeetSpot,
  stripJobsWriteMeetSpotSessionMirror,
  type JobsWriteMeetSpotStagingV1,
} from "@/lib/posts/jobs-exchange-write-meet-spot-staging";
import {
  jobsMeetSpotStagingLooksMeaningful,
  jobsWriteSessionDraftLooksMeaningful,
} from "@/lib/posts/jobs-exchange-write-draft-signal";
import { consumeTradeWriteRestoreAfterAddressFlag, setTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import { discardTradeWriteStashedDraft } from "@/lib/posts/trade-write-exit-cleanup";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  ensureClientAccessOrRedirectAsync,
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
  WORK_CATEGORY_DB_VALUES,
  WORK_CATEGORY_OTHER,
  WORK_CATEGORY_OTHER_MAX,
  EXPERIENCE_LEVEL_OPTIONS,
  JOB_TITLE_MIN,
  JOB_TITLE_MAX,
  JOB_DESCRIPTION_MAX,
  MIN_WAGE_2026,
  MIN_WAGE_PHP_HOURLY,
  JOB_SEEKER_INDUSTRY_OPTIONS,
  JOB_SEEKER_INDUSTRY_DB_VALUES,
  JOB_SEEKER_WORK_STYLE_OPTIONS,
  JOB_SEEKER_TIME_SLOT_OPTIONS,
  JOB_SEEKER_PAY_TYPE_OPTIONS,
  JOB_SEEKER_LANGUAGE_OPTIONS,
  JOB_SEEKER_VISA_OPTIONS,
  JOB_SEEKER_START_OPTIONS,
  HIRE_WEEKDAY_OPTIONS,
  HIRE_GENDER_OPTIONS,
  normalizeJobSeekerIndustrySelect,
  type JobSeekerVisaValue,
  type JobSeekerStartValue,
} from "@/lib/jobs/form-options";
import { MobileDualActionBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "../useWriteScreenEmbeddedTier1";
import { AutoGrowTextarea } from "../shared/AutoGrowTextarea";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { TradeFrequentPhrasesSheet } from "../shared/TradeFrequentPhrasesSheet";
import { SubmitButton } from "../shared/SubmitButton";
import { WriteTradeTopicSection, resolveTradeWriteCategoryId } from "../shared/WriteTradeTopicSection";
import {
  TradeDefaultLocationBlock,
  type TradeWriteAddressSsotSnapshot,
} from "../shared/TradeDefaultLocationBlock";
import type { TradeJobColumnPayload } from "@/lib/posts/trade-job-db-fields";
import { updateTradePostFromCreatePayload } from "@/lib/posts/updateTradePost";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { hydrateJobsWriteFormFromSnapshot } from "@/lib/posts/hydrate-jobs-write-from-snapshot";
import { APP_TRADE_WRITE_FORM_FB_STACK_CLASS } from "@/lib/ui/app-content-layout";
import {
  TRADE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_BLOCK_TITLE,
  TRADE_WRITE_FB_FIELD_HEAD,
  TRADE_WRITE_FB_FIELD_LABEL,
} from "@/lib/ui/trade-write-fb-ui";
import { PHILIFE_FB_TEXTAREA_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveTradeCompositionForCategory } from "@/lib/trade/category-form/resolve-for-category";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import { validateAdaptedCompositionValues } from "@/components/write/trade/generic/GenericTradeWriteFields";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import type { TradeFieldValueBag } from "@/lib/trade/category-form/field-value-bridge";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { resolveWriteCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";

interface JobsWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  /** 거래 시트·`/write` 이탈 확인 — 일반 거래 `TradeWriteForm` 과 동일 */
  onMeaningfulTradeDraftChange?: (has: boolean) => void;
  suppressTier1Chrome?: boolean;
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
  tradePolicy?: TradePolicyClient | null;
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

/** 모바일 탭 하이라이트·300ms 지연 완화 + 눌림(press) 피드백 — 일자리 칩/토글 공통 */
const JOB_TAP_CLEAR = "touch-manipulation [-webkit-tap-highlight-color:transparent]";

const JOB_CHIP_BASE = `${JOB_TAP_CLEAR} select-none rounded-full border px-3 py-1.5 sam-text-body-secondary transition-[transform,opacity,background-color] duration-100 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary focus-visible:ring-offset-2`;

function jobToggleSurface(selected: boolean): string {
  return selected
    ? "border-sam-border bg-sam-ink text-white active:opacity-[0.88]"
    : "border-sam-border bg-sam-surface text-sam-fg active:bg-sam-surface-muted";
}

function jobChipClass(selected: boolean, extraClassName = ""): string {
  return `${JOB_CHIP_BASE} ${jobToggleSurface(selected)} ${extraClassName}`.trim();
}

const JOB_LISTING_KIND_BASE = `${JOB_TAP_CLEAR} select-none rounded-ui-rect border px-3 py-3 sam-text-body font-medium transition-[transform,opacity,background-color] duration-100 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary focus-visible:ring-offset-2`;

function jobListingKindClass(selected: boolean): string {
  return `${JOB_LISTING_KIND_BASE} ${jobToggleSurface(selected)}`;
}

/** 체크박스 행 — 라벨 탭 시 즉각 피드백 */
const JOB_LABEL_CHECK_ROW =
  "cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:opacity-75";

function formatPayReadable(
  num: number,
  currency: string,
  translate: (key: "jobs_write_salary_man_only" | "jobs_write_salary_man_remainder", vars?: Record<string, string>) => string
): string {
  if (currency === "KRW" && num >= 10000) {
    const m = Math.floor(num / 10000);
    const r = num % 10000;
    return r > 0
      ? translate("jobs_write_salary_man_remainder", {
          man: String(m),
          amount: formatPrice(r, "KRW"),
        })
      : translate("jobs_write_salary_man_only", { man: String(m) });
  }
  return formatPrice(num, currency);
}

/** 드롭다운 옵션 밖의 업종(레거시·직접 입력)은 「기타」+ 상세로 합침 */
function normalizeJobsWorkCategorySelect(wc: string, wo: string): { category: string; other: string } {
  const t = wc.trim();
  const o = wo.trim();
  const opts = WORK_CATEGORY_DB_VALUES;
  if (!t) return { category: "", other: o };
  if (opts.includes(t)) {
    return { category: t, other: t === WORK_CATEGORY_OTHER ? o : "" };
  }
  return { category: WORK_CATEGORY_OTHER, other: o || t };
}

export function JobsWriteForm({
  category,
  onSuccess,
  onCancel,
  onMeaningfulTradeDraftChange,
  suppressTier1Chrome = false,
  editPostId,
  ownerEditSnapshot,
  tradePolicy = null,
}: JobsWriteFormProps) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const tradeWriteSheetEpoch = tradeWriteSheet?.openEpoch ?? 0;
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const appSettings = useMemo(() => getAppSettings(), []);
  const currency = appSettings.defaultCurrency || "PHP";
  const baseMaxImages = Math.max(1, appSettings.maxProductImages ?? 10);
  const maxImagesHire = Math.min(3, baseMaxImages);
  const maxImagesSeeker = Math.min(3, baseMaxImages);

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
  const syncTradeRegionCity = useCallback((rid: string, cid: string) => {
    setRegion(rid);
    setCity(cid);
  }, []);
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
  const [companyName, setCompanyName] = useState("");
  const [hireTimeNegotiable, setHireTimeNegotiable] = useState(false);
  /** 구인 근무 시간대 — `JOB_SEEKER_TIME_SLOT_OPTIONS` 와 동일 토큰(오전·오후·저녁 …) */
  const [hireTimeSlots, setHireTimeSlots] = useState<string[]>([]);
  const [hirePayNegotiable, setHirePayNegotiable] = useState(false);
  const [hireWeekDays, setHireWeekDays] = useState<string[]>([]);
  const [hireWorkDaysDiscuss, setHireWorkDaysDiscuss] = useState(false);
  const [hireHeadcount, setHireHeadcount] = useState("");
  const [hireGender, setHireGender] = useState("any");
  const [hireAgeNote, setHireAgeNote] = useState("");
  const [hireMeal, setHireMeal] = useState(false);
  const [hireHousing, setHireHousing] = useState(false);
  const [hireVisaNote, setHireVisaNote] = useState("");
  const [hireLanguagesPreferred, setHireLanguagesPreferred] = useState<string[]>([]);

  const [availableTime, setAvailableTime] = useState("");
  const [seekTimeSlots, setSeekTimeSlots] = useState<string[]>([]);
  const [seekLanguages, setSeekLanguages] = useState<string[]>([]);
  const [seekVisa, setSeekVisa] = useState<JobSeekerVisaValue | "">("");
  const [seekStart, setSeekStart] = useState<JobSeekerStartValue>("discuss");
  const [seekStartDate, setSeekStartDate] = useState("");
  const [seekOptionalOpen, setSeekOptionalOpen] = useState(false);
  const [experienceLevel, setExperienceLevel] = useState("none");

  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [frequentPhrasesOpen, setFrequentPhrasesOpen] = useState(false);
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

  const hasLocation = true;
  const pendingMeetSpotFocusRef = useRef(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [descriptionAppend, setDescriptionAppend] = useState("");
  const [hydratedEdit, setHydratedEdit] = useState(false);
  const [draftResumeGate, setDraftResumeGate] = useState<"pending_choice" | "ready">("ready");

  const coreLocked = Boolean(editPostId && tradePolicy && !tradePolicy.allowEditCore);
  const locationLocked = Boolean(
    editPostId && tradePolicy && tradePolicy.allowEditTradeLocation === false,
  );
  const showDescriptionAppend = Boolean(editPostId && tradePolicy?.allowAppendOnlyDescription);
  const isSeeker = listingKind === "work";

  const jobsComposition = useMemo(
    () => resolveTradeCompositionForCategory(category),
    [category]
  );
  const jobsAdaptedFields = useMemo(
    () => applyTradeBehaviorAdapter(jobsComposition, { listingKind }),
    [jobsComposition, listingKind]
  );
  const jobsFieldValues = useMemo((): TradeFieldValueBag => {
    return {
      listing_kind: listingKind,
      title,
      work_category: workCategory,
      work_category_other: workCategoryOther,
      work_term: workTerm,
      pay_type: payType,
      pay_amount: payAmount,
      description,
      work_date_start: workDate,
      work_date_end: workDateEnd,
      company_name: companyName,
      experience_level: experienceLevel,
      available_time: seekTimeSlots.join(","),
    };
  }, [
    listingKind,
    title,
    workCategory,
    workCategoryOther,
    workTerm,
    payType,
    payAmount,
    description,
    workDate,
    workDateEnd,
    companyName,
    experienceLevel,
    seekTimeSlots,
  ]);

  const toggleSeekTimeSlot = useCallback((slot: string) => {
    setSeekTimeSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }, []);

  const toggleSeekLanguage = useCallback((lang: string) => {
    setSeekLanguages((prev) => (prev.includes(lang) ? prev.filter((s) => s !== lang) : [...prev, lang]));
  }, []);

  const toggleHireWeekday = useCallback((day: string) => {
    setHireWeekDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);

  const toggleHireTimeSlot = useCallback((slot: string) => {
    setHireTimeSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }, []);

  const toggleHireLanguage = useCallback((lang: string) => {
    setHireLanguagesPreferred((prev) =>
      prev.includes(lang) ? prev.filter((s) => s !== lang) : [...prev, lang]
    );
  }, []);

  useEffect(() => {
    if (listingKind === "work") {
      setWorkTerm((t) =>
        (["long", "short_alba", "parttime", "remote", "discuss"] as const).some((v) => v === t) ? t : "short_alba"
      );
      setPayType((p) => {
        if (p === "per_task") return "hourly";
        if (["hourly", "daily", "monthly", "negotiate"].includes(p)) return p;
        return "hourly";
      });
    } else {
      setWorkTerm((t) => (["short", "long", "one_day"].includes(t) ? t : "short"));
      setPayType((p) => {
        if (["hourly", "daily", "monthly", "per_task"].includes(p)) return p;
        return "hourly";
      });
    }
  }, [listingKind]);

  useEffect(() => {
    if (listingKind !== "hire") return;
    if (workTerm === "long") {
      setWorkDate("");
      setWorkDateEnd("");
      setErrors((e) => {
        const next = { ...e };
        delete next.workDate;
        delete next.workDateEnd;
        return next;
      });
    } else if ((workTerm === "short" || workTerm === "one_day") && todayMin) {
      setWorkDate((d) => d || todayMin);
      setWorkDateEnd((end) => end || todayMin);
    }
  }, [listingKind, workTerm, todayMin]);

  const backHref = editPostId ? `/post/${editPostId}` : getCategoryHref(category);
  const payNum = payAmount.replace(/,/g, "");
  const payDisplay = payNum && !Number.isNaN(Number(payNum)) ? formatPayReadable(Number(payNum), currency, t) : "";

  const applyJobsStagingToForm = useCallback((staged: JobsWriteMeetSpotStagingV1) => {
    setListingKind(staged.listingKind === "work" ? "work" : "hire");
    setTitle(staged.title);
    {
      const n =
        staged.listingKind === "work"
          ? normalizeJobSeekerIndustrySelect(staged.workCategory, staged.workCategoryOther)
          : normalizeJobsWorkCategorySelect(staged.workCategory, staged.workCategoryOther);
      setWorkCategory(n.category);
      setWorkCategoryOther(n.other);
    }
    setWorkTerm(staged.workTerm);
    setPayType(staged.payType);
    setPayAmount(staged.payAmount);
    setDescription(staged.description);
    setRegion(staged.region);
    setCity(staged.city);
    setTradeTopicChildId(staged.tradeTopicChildId);
    setWorkDate(staged.workDate);
    setWorkDateEnd(staged.workDateEnd);
    setWorkTimeStart(staged.listingKind === "hire" ? "" : staged.workTimeStart);
    setWorkTimeEnd(staged.listingKind === "hire" ? "" : staged.workTimeEnd);
    setCompanyName(staged.companyName);
    setAvailableTime(staged.availableTime);
    setExperienceLevel(staged.experienceLevel);
    setHireTimeNegotiable(staged.hireTimeNegotiable ?? false);
    setHireTimeSlots(staged.hireTimeSlotsPipe ? staged.hireTimeSlotsPipe.split("|").filter(Boolean) : []);
    setHirePayNegotiable(staged.hirePayNegotiable ?? false);
    setHireWeekDays(staged.hireWeekDaysPipe ? staged.hireWeekDaysPipe.split("|").filter(Boolean) : []);
    setHireWorkDaysDiscuss(staged.hireWorkDaysDiscuss ?? false);
    setHireHeadcount(staged.hireHeadcount ?? "");
    setHireGender(staged.hireGender ?? "any");
    setHireAgeNote(staged.hireAgeNote ?? "");
    setHireMeal(staged.hireMeal ?? false);
    setHireHousing(staged.hireHousing ?? false);
    setHireVisaNote(staged.hireVisaNote ?? "");
    setHireLanguagesPreferred(
      staged.hireLanguagesPipe ? staged.hireLanguagesPipe.split("|").filter(Boolean) : []
    );
    setImages(staged.imageUrls.filter(Boolean).map((url) => ({ url })));
    setSeekTimeSlots(
      staged.seekTimeSlotsPipe ? staged.seekTimeSlotsPipe.split("|").filter(Boolean) : []
    );
    setSeekLanguages(
      staged.seekLanguagesPipe ? staged.seekLanguagesPipe.split("|").filter(Boolean) : []
    );
    setSeekVisa(
      staged.seekVisa === "ok" || staged.seekVisa === "check" || staged.seekVisa === "private"
        ? staged.seekVisa
        : ""
    );
    setSeekStart(
      staged.seekStart === "yes" || staged.seekStart === "date" || staged.seekStart === "discuss"
        ? staged.seekStart
        : "discuss"
    );
    setSeekStartDate(staged.seekStartDate ?? "");
  }, []);

  /** 주소·지도 복귀는 즉시 복원 / 그 외 재진입은 `TradeWriteForm` 과 동일하게 이어쓰기 선택 */
  useLayoutEffect(() => {
    if (editPostId) return;
    const skipDraftPrompt = peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
    if (skipDraftPrompt) {
      scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
    }
    const shouldRestore = consumeTradeWriteRestoreAfterAddressFlag(category.id);
    const hasMeetSpotReturn = peekTradeMeetSpotPickResult() != null;
    if (skipDraftPrompt || shouldRestore || hasMeetSpotReturn) {
      const staged = peekJobsWriteMeetSpotStaging(category.id);
      if (staged) {
        applyJobsStagingToForm(staged);
        stripJobsWriteMeetSpotSessionMirror(category.id);
      }
      setDraftResumeGate("ready");
      return;
    }
    const peeked = peekJobsWriteMeetSpotStaging(category.id);
    if (!peeked || !jobsMeetSpotStagingLooksMeaningful(peeked)) {
      if (peeked && !jobsMeetSpotStagingLooksMeaningful(peeked)) {
        clearJobsWriteMeetSpotStaging(category.id);
      }
      setDraftResumeGate("ready");
      return;
    }
    setDraftResumeGate("pending_choice");
  }, [editPostId, category.id, pathname, tradeWriteSheetEpoch, applyJobsStagingToForm]);

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

  const karrotMeetSpotDisplayLine = useMemo(() => {
    const fromMap = tradeMeetSpot?.displayLine?.trim();
    if (fromMap) return fromMap;
    return tradeAddressSsot.displayLine?.trim() ?? "";
  }, [tradeMeetSpot, tradeAddressSsot.displayLine]);

  const handleResumeJobsPersistedDraft = useCallback(() => {
    const staged = consumeJobsWriteMeetSpotStaging(category.id);
    if (!staged) return;
    applyJobsStagingToForm(staged);
    setDraftResumeGate("ready");
  }, [category.id, applyJobsStagingToForm]);

  const handleDiscardJobsPersistedDraft = useCallback(() => {
    if (editPostId) return;
    discardTradeWriteStashedDraft(category.id);
    setDraftResumeGate("ready");
    const t = localDateString();
    setListingKind("hire");
    setTitle("");
    setWorkCategory("");
    setWorkCategoryOther("");
    setWorkTerm("short");
    setPayType("hourly");
    setPayAmount("");
    setDescription("");
    setRegion("");
    setCity("");
    setTradeTopicChildId("");
    setWorkDate(t);
    setWorkDateEnd(t);
    setWorkTimeStart("");
    setWorkTimeEnd("");
    setCompanyName("");
    setAvailableTime("");
    setExperienceLevel("none");
    setHireTimeNegotiable(false);
    setHirePayNegotiable(false);
    setHireWeekDays([]);
    setHireWorkDaysDiscuss(false);
    setHireHeadcount("");
    setHireGender("any");
    setHireAgeNote("");
    setHireMeal(false);
    setHireHousing(false);
    setHireVisaNote("");
    setHireLanguagesPreferred([]);
    setHireTimeSlots([]);
    setImages([]);
    setSeekTimeSlots([]);
    setSeekLanguages([]);
    setSeekVisa("");
    setSeekStart("discuss");
    setSeekStartDate("");
    setSeekOptionalOpen(false);
    setTradeMeetSpot(null);
    setErrors({});
  }, [category.id, editPostId]);

  const meaningfulTradeDraftForSheet = useMemo(
    () =>
      editPostId
        ? false
        : draftResumeGate === "pending_choice" ||
          (listingKind === "work" &&
            (seekTimeSlots.length > 0 ||
              seekLanguages.length > 0 ||
              seekVisa !== "" ||
              seekStart !== "discuss" ||
              seekStartDate.trim().length > 0)) ||
          jobsWriteSessionDraftLooksMeaningful({
            editPostId,
            title,
            description,
            images,
            tradeTopicChildId,
            workCategory,
            workCategoryOther,
            payAmount,
            companyName,
            tradeMeetSpot,
            listingKind,
            hireTimeNegotiable,
            hirePayNegotiable,
            hireWeekDays,
            hireWorkDaysDiscuss,
            hireHeadcount,
            hireTimeSlots,
          }),
    [
      draftResumeGate,
      editPostId,
      listingKind,
      seekTimeSlots,
      seekLanguages,
      seekVisa,
      seekStart,
      seekStartDate,
      title,
      description,
      images,
      tradeTopicChildId,
      workCategory,
      workCategoryOther,
      payAmount,
      companyName,
      tradeMeetSpot,
      hireTimeNegotiable,
      hirePayNegotiable,
      hireWeekDays,
      hireWorkDaysDiscuss,
      hireHeadcount,
      hireTimeSlots,
    ]
  );

  useEffect(() => {
    if (!onMeaningfulTradeDraftChange) return;
    onMeaningfulTradeDraftChange(meaningfulTradeDraftForSheet);
    return () => onMeaningfulTradeDraftChange(false);
  }, [meaningfulTradeDraftForSheet, onMeaningfulTradeDraftChange]);

  useEffect(() => {
    if (!editPostId || !ownerEditSnapshot) return;
    const h = hydrateJobsWriteFormFromSnapshot(category, ownerEditSnapshot);
    setListingKind(h.listingKind);
    setTitle(h.title);
    {
      const n =
        h.listingKind === "work"
          ? normalizeJobSeekerIndustrySelect(h.workCategory, h.workCategoryOther)
          : normalizeJobsWorkCategorySelect(h.workCategory, h.workCategoryOther);
      setWorkCategory(n.category);
      setWorkCategoryOther(n.other);
    }
    setWorkTerm(h.workTerm);
    setPayType(h.payType);
    setPayAmount(h.payAmount);
    setDescription(h.description);
    setRegion(h.region);
    setCity(h.city);
    setTradeTopicChildId(h.tradeTopicChildId);
    setWorkDate(h.workDate);
    setWorkDateEnd(h.workDateEnd);
    setWorkTimeStart(h.listingKind === "hire" ? "" : h.workTimeStart);
    setWorkTimeEnd(h.listingKind === "hire" ? "" : h.workTimeEnd);
    setCompanyName(h.companyName);
    setAvailableTime(h.availableTime);
    setExperienceLevel(h.experienceLevel);
    setHireTimeNegotiable(h.hireTimeNegotiable);
    setHireTimeSlots(h.hireTimeSlots);
    setHirePayNegotiable(h.hirePayNegotiable);
    setHireWeekDays(h.hireWeekDays);
    setHireWorkDaysDiscuss(h.hireWorkDaysDiscuss);
    setHireHeadcount(h.hireHeadcount);
    setHireGender(h.hireGender);
    setHireAgeNote(h.hireAgeNote);
    setHireMeal(h.hireMeal);
    setHireHousing(h.hireHousing);
    setHireVisaNote(h.hireVisaNote);
    setHireLanguagesPreferred(h.hireLanguagesPreferred);
    setSeekTimeSlots(h.seekTimeSlots);
    setSeekLanguages(h.seekLanguages);
    setSeekVisa(h.seekVisa);
    setSeekStart(h.seekStart);
    setSeekStartDate(h.seekStartDate);
    setImages(h.images);
    setDescriptionAppend("");
    const rawMeta = ownerEditSnapshot.meta;
    const ts =
      rawMeta && typeof rawMeta === "object" && rawMeta !== null
        ? (rawMeta as Record<string, unknown>).trade_meet_spot
        : null;
    setTradeMeetSpot(tradeMeetSpotFromMetaSnapshot(ts));
    setHydratedEdit(true);
  }, [editPostId, ownerEditSnapshot, category]);

  /** 지도·주소 관리 이동 직전 공통 — 일반 거래 `TradeWriteForm` 세션 초안과 동일 역할 */
  const persistJobsFormStagingIfNeeded = useCallback(
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
    persistJobsWriteBeforeMeetSpot(category.id, {
      listingKind,
      title,
      workCategory,
      workCategoryOther,
      workTerm,
      payType,
      payAmount,
      description,
      region,
      city,
      tradeTopicChildId,
      workDate,
      workDateEnd,
      workTimeStart,
      workTimeEnd,
      companyName,
      availableTime,
      experienceLevel,
      hireTimeNegotiable,
      hireTimeSlotsPipe: hireTimeSlots.length > 0 ? hireTimeSlots.join("|") : undefined,
      hirePayNegotiable,
      hireWeekDaysPipe: hireWeekDays.length > 0 ? hireWeekDays.join("|") : undefined,
      hireWorkDaysDiscuss,
      hireHeadcount: hireHeadcount.trim() || undefined,
      hireGender: hireGender !== "any" ? hireGender : undefined,
      hireAgeNote: hireAgeNote.trim() || undefined,
      hireMeal: hireMeal || undefined,
      hireHousing: hireHousing || undefined,
      hireVisaNote: hireVisaNote.trim() || undefined,
      hireLanguagesPipe:
        hireLanguagesPreferred.length > 0 ? hireLanguagesPreferred.join("|") : undefined,
      imageUrls,
      seekTimeSlotsPipe: seekTimeSlots.length > 0 ? seekTimeSlots.join("|") : undefined,
      seekLanguagesPipe: seekLanguages.length > 0 ? seekLanguages.join("|") : undefined,
      seekVisa: seekVisa || undefined,
      seekStart,
      seekStartDate: seekStartDate.trim() || undefined,
    });
    if (opts?.markRestoreAfterSubflow) {
      setTradeWriteRestoreAfterAddressFlag(category.id);
    }
    return true;
  }, [
    category.id,
    images,
    listingKind,
    title,
    workCategory,
    workCategoryOther,
    workTerm,
    payType,
    payAmount,
    description,
    region,
    city,
    tradeTopicChildId,
    workDate,
    workDateEnd,
    workTimeStart,
    workTimeEnd,
    companyName,
    availableTime,
    experienceLevel,
    hireTimeNegotiable,
    hireTimeSlots,
    hirePayNegotiable,
    hireWeekDays,
    hireWorkDaysDiscuss,
    hireHeadcount,
    hireGender,
    hireAgeNote,
    hireMeal,
    hireHousing,
    hireVisaNote,
    hireLanguagesPreferred,
    seekTimeSlots,
    seekLanguages,
    seekVisa,
    seekStart,
    seekStartDate,
  ]);

  useEffect(() => {
    if (!tradeWriteSheet) return;
    const ref = tradeWriteSheet.persistSnapshotBeforeLeaveRef;
    ref.current = async () => {
      if (editPostId) return;
      await persistJobsFormStagingIfNeeded();
    };
    return () => {
      ref.current = null;
    };
  }, [tradeWriteSheet, editPostId, persistJobsFormStagingIfNeeded]);

  const handleBeforeNavigateToAddresses = useCallback(async () => {
    if (editPostId) return;
    const ok = await persistJobsFormStagingIfNeeded({ markRestoreAfterSubflow: true });
    if (!ok) throw new Error("jobs-staging-aborted");
  }, [editPostId, persistJobsFormStagingIfNeeded]);

  const handleBeforeMeetSpotPick = useCallback(async () => {
    const returnTo = tradeWriteSheet ? getCategoryHref(category) : resolveTradeMeetSpotReturnTo();
    if (!editPostId) {
      const ok = await persistJobsFormStagingIfNeeded({ markRestoreAfterSubflow: true });
      if (!ok) return;
    }
    prepareTradeMeetSpotMapNavigation(tradeMeetSpot);
    persistTradeMeetSpotReturnScrollPosition();
    markTradeMeetSpotFocusOnReturn();
    router.push(hrefTradeMeetSpotPick(returnTo));
  }, [editPostId, tradeWriteSheet, category, persistJobsFormStagingIfNeeded, tradeMeetSpot, router]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (title.trim().length < JOB_TITLE_MIN || title.trim().length > JOB_TITLE_MAX) {
      next.title = t("trade_write_title_length_error", {
        min: JOB_TITLE_MIN,
        max: JOB_TITLE_MAX,
      });
    }
    if (listingKind === "work") {
      if (!workCategory.trim()) next.workCategory = t("jobs_write_err_seek_category");
      if (workCategory === WORK_CATEGORY_OTHER) {
        const o = workCategoryOther.trim();
        if (o.length < 2) {
          next.workCategoryOther = t("jobs_write_err_category_other_min");
        } else if (o.length > WORK_CATEGORY_OTHER_MAX) {
          next.workCategoryOther = t("jobs_write_err_category_other_max", {
            max: String(WORK_CATEGORY_OTHER_MAX),
          });
        }
      }
    } else {
      if (!workCategory.trim()) next.workCategory = t("jobs_write_err_hire_category");
      if (workCategory === WORK_CATEGORY_OTHER) {
        const o = workCategoryOther.trim();
        if (o.length < 2) {
          next.workCategoryOther = t("jobs_write_err_category_other_min");
        } else if (o.length > WORK_CATEGORY_OTHER_MAX) {
          next.workCategoryOther = t("jobs_write_err_category_other_max", {
            max: String(WORK_CATEGORY_OTHER_MAX),
          });
        }
      }
    }
    if (
      tradeAddressSsot.nationalStatus !== "resolved" ||
      !tradeAddressSsot.tradeLguId
    ) {
      next.region =
        listingKind === "work"
          ? t("jobs_write_err_seek_region_read")
          : t("trade_write_err_region_read");
    }
    if (!tradeAddressSsot.ready || tradeAddressSsot.missing) {
      next.region =
        listingKind === "work"
          ? t("jobs_write_err_seek_region_confirm")
          : t("trade_write_err_region_read");
    }
    if (!description.trim()) {
      next.description =
        listingKind === "work" ? t("jobs_write_err_intro") : t("jobs_write_err_content");
    }
    if (description.trim().length > JOB_DESCRIPTION_MAX) {
      next.description = t("jobs_write_err_description_max", {
        max: String(JOB_DESCRIPTION_MAX),
      });
    }
    const amountNum = payAmount.replace(/,/g, "");
    const skipPayAmount =
      (listingKind === "work" && payType === "negotiate") ||
      (listingKind === "hire" && hirePayNegotiable);
    if (!skipPayAmount) {
      if (!amountNum || Number.isNaN(Number(amountNum)) || Number(amountNum) < 0) {
        next.payAmount =
          listingKind === "work" ? t("jobs_write_err_seek_pay") : t("jobs_write_err_pay_amount");
      } else if (payType === "hourly") {
        const n = Number(amountNum);
        if (currency === "KRW" && n < MIN_WAGE_2026) {
          next.payAmount = t("jobs_write_err_min_wage_krw", {
            amount: formatPrice(MIN_WAGE_2026, "KRW"),
          });
        } else if (currency === "PHP" && n < MIN_WAGE_PHP_HOURLY) {
          next.payAmount = t("jobs_write_err_min_wage_php", {
            amount: formatPrice(MIN_WAGE_PHP_HOURLY, "PHP"),
          });
        }
      }
    }
    if (!coreLocked && listingKind === "hire" && todayMin && (workTerm === "short" || workTerm === "one_day")) {
      if (!workDate.trim()) next.workDate = t("jobs_write_err_work_date_start");
      if (!workDateEnd.trim()) next.workDateEnd = t("jobs_write_err_work_date_end");
      if (workDate.trim() && workDate < todayMin) {
        next.workDate = t("jobs_write_err_work_date_future_start");
      }
      if (workDateEnd.trim() && workDateEnd < todayMin) {
        next.workDateEnd = t("jobs_write_err_work_date_future_end");
      }
      const start = workDate.trim() || todayMin;
      if (workDateEnd.trim() && workDateEnd < start) {
        next.workDateEnd = t("jobs_write_err_work_date_order");
      }
    }
    const compErrs = validateAdaptedCompositionValues(
      jobsAdaptedFields,
      jobsFieldValues,
      (fieldId) => {
        const label = tradeFieldAdminLabel(fieldId, language === "en" ? "en" : "ko");
        return language === "en" ? `Enter ${label}` : `${label}을(를) 입력해 주세요`;
      }
    );
    if (skipPayAmount) delete compErrs.pay_amount;
    const JOBS_COMP_TO_FORM: Record<string, string> = {
      work_category: "workCategory",
      work_category_other: "workCategoryOther",
      pay_amount: "payAmount",
      work_date_start: "workDate",
      work_date_end: "workDateEnd",
      company_name: "companyName",
      experience_level: "experienceLevel",
      available_time: "seekTimeSlots",
      listing_kind: "listingKind",
      work_term: "workTerm",
      pay_type: "payType",
      title: "title",
      description: "description",
    };
    for (const [fieldId, msg] of Object.entries(compErrs)) {
      const formKey = JOBS_COMP_TO_FORM[fieldId] ?? fieldId;
      if (!next[formKey]) next[formKey] = msg;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [
    title,
    workCategory,
    workCategoryOther,
    listingKind,
    todayMin,
    workTerm,
    workDate,
    workDateEnd,
    effectiveTradeRegionId,
    effectiveTradeCityId,
    description,
    payAmount,
    payType,
    currency,
    hirePayNegotiable,
    coreLocked,
    tradeAddressSsot,
    jobsAdaptedFields,
    jobsFieldValues,
    language,
    t,
  ]);

  const buildMeta = useCallback((): Record<string, unknown> => {
    const seekSlotsLine =
      listingKind === "work"
        ? JOB_SEEKER_TIME_SLOT_OPTIONS.filter((o) => seekTimeSlots.includes(o.value))
            .map((o) => t(o.labelKey))
            .join(", ")
        : "";
    const hireSlotsLine =
      listingKind === "hire"
        ? JOB_SEEKER_TIME_SLOT_OPTIONS.filter((o) => hireTimeSlots.includes(o.value))
            .map((o) => t(o.labelKey))
            .join(", ")
        : "";
    const base: Record<string, unknown> = {
      listing_kind: listingKind,
      job_type: listingKind === "hire" ? "hire" : "seek",
      work_category: workCategory.trim(),
      work_category_other:
        workCategory === WORK_CATEGORY_OTHER
          ? workCategoryOther.trim().slice(0, WORK_CATEGORY_OTHER_MAX) || undefined
          : undefined,
      work_term: workTerm,
      pay_type: payType,
      pay_amount:
        (listingKind === "work" && payType === "negotiate") ||
        (listingKind === "hire" && hirePayNegotiable)
          ? undefined
          : payNum && !Number.isNaN(Number(payNum))
            ? Number(payNum)
            : undefined,
      work_date_start:
        listingKind === "hire" && workTerm === "long" ? undefined : workDate.trim() || undefined,
      work_date_end:
        listingKind === "hire" && workTerm === "long" ? undefined : workDateEnd.trim() || undefined,
      work_time_start: listingKind === "hire" ? undefined : workTimeStart.trim() || undefined,
      work_time_end: listingKind === "hire" ? undefined : workTimeEnd.trim() || undefined,
      same_day_pay: false,
      company_name: listingKind === "hire" ? companyName.trim() || undefined : undefined,
      available_time:
        listingKind === "work"
          ? seekSlotsLine || availableTime.trim() || undefined
          : listingKind === "hire"
            ? hireSlotsLine || undefined
            : undefined,
      experience_level: listingKind === "work" ? experienceLevel : undefined,
      trade_chat_kind: "job",
    };
    if (listingKind === "work") {
      base.trade_chat_call_policy = "none";
      if (seekTimeSlots.length > 0) base.seek_time_slots = seekTimeSlots.join("|");
      if (seekLanguages.length > 0) base.seeker_languages = seekLanguages.join("|");
      if (seekVisa) base.seeker_visa = seekVisa;
      base.seeker_start = seekStart;
      if (seekStart === "date" && seekStartDate.trim()) base.seeker_start_date = seekStartDate.trim();
    } else {
      if (hireTimeNegotiable) base.hire_time_negotiable = true;
      if (hireTimeSlots.length > 0) base.hire_work_time_slots = hireTimeSlots.join("|");
      if (hirePayNegotiable) base.hire_pay_negotiable = true;
      if (hireWorkDaysDiscuss) base.hire_work_days_discuss = true;
      if (hireWeekDays.length > 0) base.hire_week_days_pipe = hireWeekDays.join("|");
      if (hireGender !== "any") base.hire_gender = hireGender;
      if (hireAgeNote.trim()) base.hire_age_note = hireAgeNote.trim().slice(0, 120);
      if (hireMeal) base.hire_meal = true;
      if (hireHousing) base.hire_housing = true;
      if (hireVisaNote.trim()) base.hire_visa_note = hireVisaNote.trim().slice(0, 160);
      if (hireLanguagesPreferred.length > 0) base.hire_languages = hireLanguagesPreferred.join("|");
      if (hireHeadcount.trim()) base.hire_headcount = hireHeadcount.trim().slice(0, 12);
    }
    return base;
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
    hireTimeNegotiable,
    hireTimeSlots,
    hirePayNegotiable,
    hireWorkDaysDiscuss,
    hireWeekDays,
    hireGender,
    hireAgeNote,
    hireMeal,
    hireHousing,
    hireVisaNote,
    hireLanguagesPreferred,
    hireHeadcount,
    companyName,
    availableTime,
    experienceLevel,
    seekTimeSlots,
    seekLanguages,
    seekVisa,
    seekStart,
    seekStartDate,
  ]);

  const buildTradeJobPayload = useCallback((): TradeJobColumnPayload => {
    const wc =
      listingKind === "work"
        ? normalizeJobSeekerIndustrySelect(workCategory, workCategoryOther)
        : normalizeJobsWorkCategorySelect(workCategory, workCategoryOther);
    const cat =
      wc.category === WORK_CATEGORY_OTHER && wc.other.trim()
        ? `${WORK_CATEGORY_OTHER} · ${wc.other.trim()}`.slice(0, 200)
        : wc.category.trim() || wc.other.trim();
    const hireLong = listingKind === "hire" && workTerm === "long";
    const resolvedPay =
      (listingKind === "work" && payType === "negotiate") ||
      (listingKind === "hire" && hirePayNegotiable)
        ? null
        : payNum && !Number.isNaN(Number(payNum))
          ? Number(payNum)
          : null;
    const workDaysOut =
      listingKind === "hire"
        ? hireWorkDaysDiscuss
          ? ["discuss"]
          : hireWeekDays.length > 0
            ? [...hireWeekDays]
            : null
        : null;
    const hcRaw = hireHeadcount.replace(/,/g, "").trim();
    const headcountOut =
      listingKind === "hire" && hcRaw
        ? (() => {
            const n = Math.floor(Number(hcRaw));
            return Number.isFinite(n) && n > 0 ? n : null;
          })()
        : null;
    const experienceRequiredOut =
      listingKind === "hire"
        ? experienceLevel.trim() || null
        : listingKind === "work"
          ? experienceLevel
          : null;
    return {
      jobEmploymentType: (workTerm || (listingKind === "work" ? "short_alba" : "short")).trim(),
      jobCategory: cat,
      payType: payType.trim(),
      payAmount: resolvedPay,
      workStartDate: hireLong ? null : workDate.trim() || null,
      workEndDate: hireLong ? null : workDateEnd.trim() || null,
      workDays: workDaysOut,
      workStartTime: listingKind === "hire" ? null : workTimeStart.trim() || null,
      workEndTime: listingKind === "hire" ? null : workTimeEnd.trim() || null,
      headcount: headcountOut,
      experienceRequired: experienceRequiredOut,
    };
  }, [
    workCategory,
    workCategoryOther,
    workTerm,
    payType,
    payNum,
    workDate,
    workDateEnd,
    workTimeStart,
    workTimeEnd,
    listingKind,
    experienceLevel,
    hirePayNegotiable,
    hireWeekDays,
    hireWorkDaysDiscuss,
    hireHeadcount,
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (editPostId && !hydratedEdit) return;
      if (!validate()) return;
      setSubmitting(true);
      try {
        const pathFallback = editPostId
          ? `/products/${editPostId}/edit`
          : `/write/${category.slug}`;
        if (editPostId) {
          if (!(await ensureClientAccessOrRedirectAsync(router, pathname || pathFallback))) {
            return;
          }
        } else if (!(await requireAuthAction("trade_create_item", async () => {}, { next: pathname || pathFallback }))) {
          return;
        }
        const user = getCurrentUser();
        const files = images.map((i) => i.file).filter((f): f is File => !!f);
        const uploaded = files.length > 0 && user?.id ? await uploadPostImages(files, user.id) : [];
        const existingUrls = images
          .map((i) => i.url)
          .filter((u): u is string => typeof u === "string" && u.length > 0 && !u.startsWith("blob:"));
        const imageUrls = [...existingUrls, ...uploaded];
        let meta: Record<string, unknown> = buildMeta();
        const submitRegion = effectiveTradeRegionId.trim();
        const submitCity = effectiveTradeCityId.trim();
        if (tradeMeetSpot) {
          const meetMeta = buildTradeMeetSpotMetaForPersist(tradeMeetSpot);
          if (meetMeta) meta = { ...meta, ...meetMeta };
        }
        const priceNum = payNum ? Number(payNum) : null;
        const tradeJob = buildTradeJobPayload();
        if (editPostId) {
          const res = await updateTradePostFromCreatePayload(
            editPostId,
            {
              type: "trade",
              categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
              title: title.trim(),
              content: description.trim(),
              price: priceNum,
              isPriceOfferEnabled: false,
              isFreeShare: false,
              region: submitRegion || undefined,
              city: submitCity || undefined,
              tradeLguId: tradeAddressSsot.tradeLguId ?? undefined,
              barangay: undefined,
              imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
              meta: Object.keys(meta).length > 0 ? meta : undefined,
              tradeJob,
            },
            showDescriptionAppend ? { descriptionAppend: descriptionAppend.trim() || null } : undefined
          );
          if (res.ok) {
            clearJobsWriteMeetSpotStaging(category.id);
            clearTradeMeetSpotSessionNavigationState();
            invalidateHomePostsCache();
            onSuccess(editPostId);
          } else {
            if (redirectForBlockedAction(router, res.error, pathname || pathFallback)) return;
            setErrors({ submit: res.error });
          }
          return;
        }
        const res = await createPost({
          type: "trade",
          categoryId: resolveTradeWriteCategoryId(category, tradeTopicChildId),
          title: title.trim(),
          content: description.trim(),
          price: priceNum,
          isPriceOfferEnabled: false,
          isFreeShare: false,
          region: submitRegion || undefined,
          city: submitCity || undefined,
          tradeLguId: tradeAddressSsot.tradeLguId ?? undefined,
          barangay: undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          meta: Object.keys(meta).length > 0 ? meta : undefined,
          tradeJob,
        });
        if (res.ok) {
          clearJobsWriteMeetSpotStaging(category.id);
          clearTradeMeetSpotSessionNavigationState();
          invalidateHomePostsCache();
          onSuccess(res.id);
        } else {
          if (redirectForBlockedAction(router, res.error, pathname || pathFallback)) return;
          setErrors({ submit: res.error });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      validate,
      buildMeta,
      buildTradeJobPayload,
      title,
      description,
      payNum,
      images,
      category,
      tradeTopicChildId,
      effectiveTradeRegionId,
      effectiveTradeCityId,
      router,
      pathname,
      onSuccess,
      editPostId,
      hydratedEdit,
      showDescriptionAppend,
      descriptionAppend,
      tradeAddressSsot,
      tradeMeetSpot,
    ]
  );

  const categoryLabel = useMemo(
    () => resolveWriteCategoryUILabel(language, category),
    [language, category]
  );
  const tierTitle = editPostId
    ? `${categoryLabel} · ${t("jobs_write_header_edit")}`
    : `${categoryLabel} · ${t("jobs_write_header_quick")}`;
  const policyHint = tradePolicy?.hint?.trim() ?? "";

  const tradeLocationEl = (
    <div id={TRADE_MEET_SPOT_SCROLL_ANCHOR_ID} className={locationLocked || coreLocked ? "pointer-events-none opacity-60" : ""}>
      <TradeDefaultLocationBlock
        category={category}
        editPostId={editPostId}
        region={region}
        city={city}
        onSyncRegionCity={syncTradeRegionCity}
        error={errors.region}
        readOnly={locationLocked || coreLocked}
        onBeforeNavigateToAddresses={!editPostId ? handleBeforeNavigateToAddresses : undefined}
        onAddressResolved={setTradeAddressSsot}
        karrotMeetSpotUi={hasLocation}
        meetSpotLine={karrotMeetSpotDisplayLine || null}
        meetSpotError={errors.meetSpot}
        onBeforeMeetSpotPick={!locationLocked && !coreLocked ? () => void handleBeforeMeetSpotPick() : undefined}
        meetSpotHeading={isSeeker ? t("jobs_write_meet_seeker") : t("jobs_write_meet_hire")}
        denseLayout
      />
    </div>
  );

  return (
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-sam-app pb-28"
          : "min-h-screen bg-sam-app pb-28"
      }
    >
      <MobileDualActionBottomSheet
        open={draftResumeGate === "pending_choice"}
        onClose={() => {}}
        title={t("trade_099")}
        description={t("trade_write_draft_resume_body")}
        secondaryLabel={t("trade_write_draft_resume_new")}
        onSecondary={handleDiscardJobsPersistedDraft}
        primaryLabel={t("trade_write_draft_resume_continue")}
        onPrimary={handleResumeJobsPersistedDraft}
        primaryTone="primary"
        zIndexClass="z-[72]"
        ariaLabel={t("jobs_write_draft_aria")}
        interactionMode="blocking"
      />
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={tierTitle}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <form
        onSubmit={handleSubmit}
        className={`${APP_TRADE_WRITE_FORM_FB_STACK_CLASS} [-webkit-tap-highlight-color:transparent]`}
      >
        <div className={TRADE_WRITE_FB_SECTION}>
          <p className="text-[13px] font-medium text-[#65676B]">{t("trade_113")}</p>
        </div>

        {editPostId && policyHint ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-950">{policyHint}</div>
        ) : null}

        <section
          className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
        >
          <h4 className={TRADE_WRITE_FB_BLOCK_TITLE}>{t("trade_059")}</h4>
          <div className="grid grid-cols-2 gap-2">
            {JOB_LISTING_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setListingKind(opt.value)}
                className={jobListingKindClass(listingKind === opt.value)}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <div className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
          <WriteTradeTopicSection
            category={category}
            value={tradeTopicChildId}
            onChange={setTradeTopicChildId}
          />
        </div>

        <section
          className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
        >
          <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_101")}</h4>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              listingKind === "hire"
                ? t("jobs_write_title_ph_hire")
                : t("jobs_write_title_ph_work")
            }
            maxLength={JOB_TITLE_MAX}
            className={`w-full rounded-ui-rect border px-3 py-2.5 sam-text-body ${
              errors.title ? "border-red-400 bg-red-50" : "border-sam-border"
            }`}
          />
          {errors.title && <p className="mt-1 sam-text-body-secondary text-red-500">{errors.title}</p>}
          <p className="mt-1 sam-text-helper text-sam-muted">{title.length}/{JOB_TITLE_MAX}</p>
        </section>

        {!isSeeker ? (
          <section
            className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
          >
            <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_085")}</h4>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t("trade_003")}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
            />
          </section>
        ) : null}

        {!isSeeker ? (
          <>
            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_083")}</p>
              <label htmlFor="jobs-work-category-select" className="sr-only">
                {t("jobs_write_category_select_aria")}
              </label>
              <select
                id="jobs-work-category-select"
                value={
                  !workCategory.trim()
                    ? ""
                    : WORK_CATEGORY_DB_VALUES.includes(workCategory)
                      ? workCategory
                      : WORK_CATEGORY_OTHER
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setWorkCategory(v);
                  if (v !== WORK_CATEGORY_OTHER) setWorkCategoryOther("");
                }}
                className={`w-full rounded-ui-rect border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg ${
                  errors.workCategory ? "border-red-400 bg-red-50" : "border-sam-border"
                }`}
              >
                <option value="">{t("trade_084")}</option>
                {WORK_CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {t(cat.labelKey)}
                  </option>
                ))}
              </select>
              {workCategory === WORK_CATEGORY_OTHER && (
                <div className="mt-3">
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    {t("jobs_wc_other_detail_label")}
                  </label>
                  <input
                    type="text"
                    value={workCategoryOther}
                    onChange={(e) => setWorkCategoryOther(e.target.value.slice(0, WORK_CATEGORY_OTHER_MAX))}
                    placeholder={t("trade_090")}
                    className={`w-full rounded-ui-rect border px-3 py-2.5 sam-text-body ${
                      errors.workCategoryOther ? "border-red-400 bg-red-50" : "border-sam-border"
                    }`}
                  />
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    {workCategoryOther.length}/{WORK_CATEGORY_OTHER_MAX} · {t("jobs_write_category_other_hint")}
                  </p>
                </div>
              )}
              {errors.workCategory && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.workCategory}</p>
              )}
              {errors.workCategoryOther && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.workCategoryOther}</p>
              )}
            </section>

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_039")}</p>
              <div className="flex flex-wrap gap-2">
                {JOB_WORK_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWorkTerm(opt.value)}
                    className={jobChipClass(workTerm === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            {(workTerm === "short" || workTerm === "one_day") && (
              <section
                className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
              >
                <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_035")}</p>
                <p className="mb-2 sam-text-helper text-sam-muted">{t("trade_093")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="mb-1 block sam-text-xxs text-sam-muted">{t("trade_080")}</span>
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
                      className={`w-full rounded-ui-rect border px-2 py-2 sam-text-body ${
                        errors.workDate ? "border-red-400 bg-red-50" : "border-sam-border"
                      }`}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block sam-text-xxs text-sam-muted">{t("trade_104")}</span>
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
                      className={`w-full rounded-ui-rect border px-2 py-2 sam-text-body ${
                        errors.workDateEnd ? "border-red-400 bg-red-50" : "border-sam-border"
                      }`}
                    />
                  </div>
                </div>
                {(errors.workDate || errors.workDateEnd) && (
                  <p className="mt-1 sam-text-body-secondary text-red-500">{errors.workDate || errors.workDateEnd}</p>
                )}
              </section>
            )}

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_037")}</p>
              <p className="mb-2 sam-text-helper text-sam-muted">{t("trade_094")}</p>
              <div className="flex flex-wrap gap-2">
                {JOB_SEEKER_TIME_SLOT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={hireTimeNegotiable}
                    onClick={() => toggleHireTimeSlot(opt.value)}
                    className={jobChipClass(
                      hireTimeSlots.includes(opt.value),
                      "disabled:opacity-40 disabled:active:scale-100"
                    )}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <label className={`mt-2 flex items-center gap-2 ${JOB_LABEL_CHECK_ROW}`}>
                <input
                  type="checkbox"
                  checked={hireTimeNegotiable}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setHireTimeNegotiable(v);
                    if (v) setHireTimeSlots([]);
                  }}
                  className="rounded border-sam-border"
                />
                <span className="sam-text-body text-sam-fg">{t("trade_079")}</span>
              </label>
            </section>

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_038")}</p>
              <div className="flex flex-wrap gap-2">
                {HIRE_WEEKDAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={hireWorkDaysDiscuss}
                    onClick={() => toggleHireWeekday(opt.value)}
                    className={jobChipClass(
                      hireWeekDays.includes(opt.value),
                      "disabled:opacity-40 disabled:active:scale-100"
                    )}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <label className={`mt-2 flex items-center gap-2 ${JOB_LABEL_CHECK_ROW}`}>
                <input
                  type="checkbox"
                  checked={hireWorkDaysDiscuss}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setHireWorkDaysDiscuss(v);
                    if (v) setHireWeekDays([]);
                  }}
                  className="rounded border-sam-border"
                />
                <span className="sam-text-body text-sam-fg">{t("trade_095")}</span>
              </label>
            </section>

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_042")}</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {PAY_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPayType(opt.value)}
                    className={jobChipClass(payType === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-ui-rect border border-sam-border px-3 py-2.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={hirePayNegotiable ? "" : payAmount}
                  onChange={(e) => setPayAmount(formatPriceInput(e.target.value))}
                  placeholder="0"
                  disabled={hirePayNegotiable}
                  className={`min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none ${
                    errors.payAmount ? "text-red-600" : ""
                  } ${hirePayNegotiable ? "text-sam-muted" : ""}`}
                />
                {!hirePayNegotiable ? (
                  <span className="sam-text-body text-sam-muted">{getCurrencyUnitLabel(currency)}</span>
                ) : null}
              </div>
              {!hirePayNegotiable && payDisplay ? (
                <p className="mt-1 sam-text-helper text-sam-muted">{payDisplay}</p>
              ) : null}
              {errors.payAmount && <p className="mt-1 sam-text-body-secondary text-red-500">{errors.payAmount}</p>}
              <label className={`mt-2 flex items-center gap-2 ${JOB_LABEL_CHECK_ROW}`}>
                <input
                  type="checkbox"
                  checked={hirePayNegotiable}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setHirePayNegotiable(v);
                    if (v) setPayAmount("");
                  }}
                  className="rounded border-sam-border"
                />
                <span className="sam-text-body text-sam-fg">{t("trade_043")}</span>
              </label>
            </section>

            {tradeLocationEl}

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_058")}</p>
              <label className="mb-1 block sam-text-body-secondary text-sam-fg">{t("trade_057")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={hireHeadcount}
                onChange={(e) => setHireHeadcount(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                placeholder={t("trade_086")}
                className="mb-3 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
              />
              <p className="mb-2 sam-text-body-secondary text-sam-fg">{t("trade_030")}</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExperienceLevel(opt.value)}
                    className={jobChipClass(experienceLevel === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <p className="mb-2 sam-text-body-secondary text-sam-fg">{t("trade_077")}</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {HIRE_GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setHireGender(opt.value)}
                    className={jobChipClass(hireGender === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <label className="mb-1 block sam-text-body-secondary text-sam-fg">{t("trade_051")}</label>
              <input
                type="text"
                value={hireAgeNote}
                onChange={(e) => setHireAgeNote(e.target.value.slice(0, 80))}
                placeholder={t("trade_088")}
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
              />
            </section>

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_118")}</p>
              <label className={`flex items-center gap-2 py-1 ${JOB_LABEL_CHECK_ROW}`}>
                <input
                  type="checkbox"
                  checked={hireMeal}
                  onChange={(e) => setHireMeal(e.target.checked)}
                  className="rounded border-sam-border"
                />
                <span className="sam-text-body text-sam-fg">{t("trade_081")}</span>
              </label>
              <label className={`flex items-center gap-2 py-1 ${JOB_LABEL_CHECK_ROW}`}>
                <input
                  type="checkbox"
                  checked={hireHousing}
                  onChange={(e) => setHireHousing(e.target.checked)}
                  className="rounded border-sam-border"
                />
                <span className="sam-text-body text-sam-fg">{t("trade_078")}</span>
              </label>
              <label className="mb-1 mt-2 block sam-text-body-secondary text-sam-fg">{t("trade_068")}</label>
              <input
                type="text"
                value={hireVisaNote}
                onChange={(e) => setHireVisaNote(e.target.value.slice(0, 120))}
                placeholder={t("trade_089")}
                className="mb-3 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
              />
              <p className="mb-2 sam-text-body-secondary text-sam-fg">{t("trade_135")}</p>
              <div className="flex flex-wrap gap-2">
                {JOB_SEEKER_LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleHireLanguage(opt.value)}
                    className={jobChipClass(hireLanguagesPreferred.includes(opt.value))}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_136")}</p>
              <label htmlFor="jobs-seeker-industry-select" className="sr-only">
                {t("jobs_write_seek_category_select_aria")}
              </label>
              <select
                id="jobs-seeker-industry-select"
                value={
                  !workCategory.trim()
                    ? ""
                    : JOB_SEEKER_INDUSTRY_DB_VALUES.includes(workCategory)
                      ? workCategory
                      : WORK_CATEGORY_OTHER
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setWorkCategory(v);
                  if (v !== WORK_CATEGORY_OTHER) setWorkCategoryOther("");
                }}
                className={`w-full rounded-ui-rect border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg ${
                  errors.workCategory ? "border-red-400 bg-red-50" : "border-sam-border"
                }`}
              >
                <option value="">{t("trade_137")}</option>
                {JOB_SEEKER_INDUSTRY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {t(cat.labelKey)}
                  </option>
                ))}
              </select>
              {workCategory === WORK_CATEGORY_OTHER && (
                <div className="mt-3">
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    {t("jobs_wc_other_detail_label")}
                  </label>
                  <input
                    type="text"
                    value={workCategoryOther}
                    onChange={(e) => setWorkCategoryOther(e.target.value.slice(0, WORK_CATEGORY_OTHER_MAX))}
                    placeholder={t("trade_091")}
                    className={`w-full rounded-ui-rect border px-3 py-2.5 sam-text-body ${
                      errors.workCategoryOther ? "border-red-400 bg-red-50" : "border-sam-border"
                    }`}
                  />
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    {workCategoryOther.length}/{WORK_CATEGORY_OTHER_MAX}
                  </p>
                </div>
              )}
              {errors.workCategory && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.workCategory}</p>
              )}
              {errors.workCategoryOther && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.workCategoryOther}</p>
              )}
            </section>

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_133")}</p>
              <div className="flex flex-wrap gap-2">
                {JOB_SEEKER_WORK_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWorkTerm(opt.value)}
                    className={jobChipClass(workTerm === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_034")}</p>
              <p className="mb-2 sam-text-helper text-sam-muted">{t("trade_063")}</p>
              <div className="flex flex-wrap gap-2">
                {JOB_SEEKER_TIME_SLOT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleSeekTimeSlot(opt.value)}
                    className={jobChipClass(seekTimeSlots.includes(opt.value))}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            {tradeLocationEl}

            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_029")}</p>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExperienceLevel(opt.value)}
                    className={jobChipClass(experienceLevel === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {!isSeeker ? (
          <>
            <section className={TRADE_WRITE_FB_SECTION}>
              <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>
                {t("jobs_write_description_label")} <span className="text-red-500">*</span>
              </h4>
              <AutoGrowTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                readOnly={showDescriptionAppend}
                placeholder={t("trade_036")}
                maxLength={JOB_DESCRIPTION_MAX}
                className={`w-full ${PHILIFE_FB_TEXTAREA_CLASS} mt-0.5 min-h-[100px] rounded-md border px-3 py-2 text-[15px] outline-none placeholder:text-[#8a8d91] focus:border-sam-primary ${
                  errors.description ? "border-red-400 bg-red-50" : "border-[#ccd0d5] bg-white"
                } ${showDescriptionAppend ? "bg-sam-app text-sam-fg" : "text-[#050505]"}`}
              />
              {!showDescriptionAppend ? (
                <>
                  <button
                    type="button"
                    className="mt-1.5 touch-manipulation [-webkit-tap-highlight-color:transparent] rounded-ui-rect border border-sam-border bg-sam-surface-muted px-2 py-1 text-[11px] leading-snug text-sam-fg transition-[transform,opacity] duration-100 active:scale-[0.97] active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary focus-visible:ring-offset-2"
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
              <p className="mt-1 text-right sam-text-helper text-sam-muted">{description.length}/{JOB_DESCRIPTION_MAX}</p>
              {errors.description && <p className="sam-text-body-secondary text-red-500">{errors.description}</p>}
              {showDescriptionAppend ? (
                <div className="mt-2 border-t border-[#e4e6eb] pt-2">
                  <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_116")}</label>
                  <p className="mb-1 text-[12px] text-[#8a8d91]">{t("trade_045")}</p>
                  <AutoGrowTextarea
                    value={descriptionAppend}
                    onChange={(e) => setDescriptionAppend(e.target.value)}
                    placeholder=""
                    className={`mt-0.5 w-full ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[88px] rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[15px] outline-none focus:border-sam-primary`}
                  />
                </div>
              ) : null}
            </section>
            <div className={TRADE_WRITE_FB_SECTION}>
              <ImageUploader
                value={images}
                onChange={setImages}
                maxCount={maxImagesHire}
                label={t("jobs_write_store_photos_label")}
                disabled={coreLocked}
                compact={false}
                variant="karrot"
              />
            </div>
          </>
        ) : (
          <>
            <section
              className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}
            >
              <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_134")}</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {JOB_SEEKER_PAY_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPayType(opt.value);
                      if (opt.value === "negotiate") setPayAmount("");
                    }}
                    className={jobChipClass(payType === opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-ui-rect border border-sam-border px-3 py-2.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={payType === "negotiate" ? "" : payAmount}
                  onChange={(e) => setPayAmount(formatPriceInput(e.target.value))}
                  placeholder={t("trade_087")}
                  disabled={payType === "negotiate"}
                  className={`min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none ${
                    errors.payAmount ? "text-red-600" : ""
                  } ${payType === "negotiate" ? "text-sam-muted" : ""}`}
                />
                {payType !== "negotiate" ? (
                  <span className="sam-text-body text-sam-muted">{getCurrencyUnitLabel(currency)}</span>
                ) : null}
              </div>
              {payType !== "negotiate" && payDisplay ? (
                <p className="mt-1 sam-text-helper text-sam-muted">{payDisplay}</p>
              ) : null}
              {errors.payAmount && <p className="mt-1 sam-text-body-secondary text-red-500">{errors.payAmount}</p>}
            </section>

            <section className={TRADE_WRITE_FB_SECTION}>
              <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>
                {t("jobs_write_intro_label")} <span className="text-red-500">*</span>
              </h4>
              <AutoGrowTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                readOnly={showDescriptionAppend}
                placeholder={t("trade_008")}
                maxLength={JOB_DESCRIPTION_MAX}
                className={`w-full ${PHILIFE_FB_TEXTAREA_CLASS} mt-0.5 min-h-[120px] rounded-md border px-3 py-2 text-[15px] outline-none placeholder:text-[#8a8d91] focus:border-sam-primary ${
                  errors.description ? "border-red-400 bg-red-50" : "border-[#ccd0d5] bg-white"
                } ${showDescriptionAppend ? "bg-sam-app text-sam-fg" : "text-[#050505]"}`}
              />
              <p className="mt-1 text-right sam-text-helper text-sam-muted">
                {description.length}/{JOB_DESCRIPTION_MAX}
              </p>
              {errors.description && <p className="sam-text-body-secondary text-red-500">{errors.description}</p>}
              {showDescriptionAppend ? (
                <div className="mt-2 border-t border-[#e4e6eb] pt-2">
                  <label className={TRADE_WRITE_FB_FIELD_LABEL}>{t("trade_116")}</label>
                  <p className="mb-1 text-[12px] text-[#8a8d91]">
                    {t("jobs_write_append_hint")}
                  </p>
                  <AutoGrowTextarea
                    value={descriptionAppend}
                    onChange={(e) => setDescriptionAppend(e.target.value)}
                    placeholder=""
                    className={`mt-0.5 w-full ${PHILIFE_FB_TEXTAREA_CLASS} min-h-[88px] rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[15px] outline-none focus:border-sam-primary`}
                  />
                </div>
              ) : null}
            </section>

            <section className={`${TRADE_WRITE_FB_SECTION} ${coreLocked ? "pointer-events-none opacity-60" : ""}`}>
              <button
                type="button"
                onClick={() => setSeekOptionalOpen((o) => !o)}
                className="flex w-full touch-manipulation items-center justify-between gap-2 [-webkit-tap-highlight-color:transparent] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-left sam-text-body font-medium text-sam-fg transition-[transform,opacity,background-color] duration-100 active:scale-[0.99] active:bg-sam-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary focus-visible:ring-offset-2"
              >
                <span>{t("trade_076")}</span>
                <span className="sam-text-helper text-sam-muted">{seekOptionalOpen ? t("trade_write_collapse") : t("trade_write_expand")}</span>
              </button>
              {seekOptionalOpen ? (
                <div className="mt-3 space-y-4 border-t border-[#e4e6eb] pt-3">
                  <div>
                    <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_007")}</p>
                    <div className="flex flex-wrap gap-2">
                      {JOB_SEEKER_LANGUAGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleSeekLanguage(opt.value)}
                          className={jobChipClass(seekLanguages.includes(opt.value))}
                        >
                          {t(opt.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_067")}</p>
                    <div className="flex flex-wrap gap-3">
                      {JOB_SEEKER_VISA_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-center gap-2 touch-manipulation [-webkit-tap-highlight-color:transparent] active:opacity-75`}
                        >
                          <input
                            type="radio"
                            name="jobs_seeker_visa"
                            checked={seekVisa === opt.value}
                            onChange={() => setSeekVisa(opt.value)}
                          />
                          <span className="sam-text-body text-sam-fg">{t(opt.labelKey)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 sam-text-body font-semibold text-sam-fg">{t("trade_107")}</p>
                    <div className="flex flex-wrap gap-3">
                      {JOB_SEEKER_START_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-center gap-2 touch-manipulation [-webkit-tap-highlight-color:transparent] active:opacity-75`}
                        >
                          <input
                            type="radio"
                            name="jobs_seeker_start"
                            checked={seekStart === opt.value}
                            onChange={() => setSeekStart(opt.value)}
                          />
                          <span className="sam-text-body text-sam-fg">{t(opt.labelKey)}</span>
                        </label>
                      ))}
                    </div>
                    {seekStart === "date" ? (
                      <input
                        type="date"
                        min={todayMin || undefined}
                        value={seekStartDate}
                        onChange={(e) => setSeekStartDate(e.target.value)}
                        className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                      />
                    ) : null}
                  </div>
                  <div>
                    <ImageUploader
                      value={images}
                      onChange={setImages}
                      maxCount={maxImagesSeeker}
                      label={t("jobs_write_photos_optional_label")}
                      disabled={coreLocked}
                      compact={false}
                      variant="karrot"
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </>
        )}

        {errors.submit && <p className="px-4 py-2 sam-text-body-secondary text-red-500">{errors.submit}</p>}

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-sam-border bg-sam-surface px-4 py-3 safe-area-pb">
          <SubmitButton
            label={editPostId ? t("trade_write_submit_edit") : t("trade_write_submit")}
            submitting={submitting}
            onCancel={onCancel}
          />
        </div>
      </form>
    </div>
  );
}

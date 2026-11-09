"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-seed-queries";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS,
} from "@/lib/business/owner-admin-footer-actions";
import {
  BUSINESS_APPLY_SUBMIT_BLOCKED_FIX_KEY,
  BUSINESS_APPLY_SUBMIT_BLOCKED_MESSAGE_KEY,
  resolveBusinessApplySubmitBlockedReason,
  type BusinessApplySubmitBlockedReason,
} from "@/lib/business/business-apply-submit-gate";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  resolveStoreTaxonomyPrimaryDisplayName,
  resolveStoreTaxonomyTopicDisplayName,
} from "@/lib/stores/resolve-store-taxonomy-display-name";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";
import {
  BusinessApplyPartnerSection,
  type BusinessApplyPartnerState,
} from "@/components/business/BusinessApplyPartnerSection";
import type { StorePartnerAgreementInput } from "@/lib/stores/partner/store-partner-agreement-contract";
import { StorePhoneVerifySheet, type StorePhoneVerified } from "@/components/business/apply/StorePhoneVerifySheet";
import { StoreLocationPickSheet, type StoreApplyLocation } from "@/components/business/apply/StoreLocationPickSheet";
import { StoreApplicationProgressBar } from "@/components/business/apply/StoreApplicationProgress";
import { STORE_APPLICATION_STEP_KEYS } from "@/lib/stores/store-application-step";
import { STORE_APPLY_LIMITS, normalizeStoreApplyName } from "@/lib/stores/store-application-limits";

/** 신청 화면 프로필 씨앗 — @아이디 표시용 (매장 ID 는 서버 자동 생성 · 화면 미표시) */
export type BusinessApplyProfileSeed = {
  username: string;
};

/** 보완 제출 모드 — 이미 저장된 신청 내용 */
export type BusinessApplyInitial = {
  applicantNickname: string;
  shopName: string;
  branchName: string;
  description: string;
  requestNote: string;
  kakaoId: string;
  categoryPrimarySlug: string;
  categorySubSlug: string;
  /** 저장된 매장 전화(`09…`) · 인증 시각 */
  phone: string;
  phoneVerifiedAt: string | null;
  location: StoreApplyLocation | null;
  /** 관리자 보완 요청 사유 */
  revisionNote: string;
};

export interface BusinessApplyFormValues {
  applicantNickname: string;
  shopName: string;
  branchName: string;
  description: string;
  requestNote: string;
  kakaoId: string;
  categoryPrimarySlug: string;
  categorySubSlug: string;
  /** 새 매장 전화 인증 기록 (보완 제출에서 번호를 안 바꾸면 null) */
  phoneVerification: StorePhoneVerified | null;
  location: StoreApplyLocation | null;
  /** 매장 입점·수수료 서약 — null = 게시된 약관 없음 */
  partnerAgreement?: StorePartnerAgreementInput | null;
}

type FormState = Omit<BusinessApplyFormValues, "partnerAgreement">;

/** 글자 비율 (Owner 2026-11-10): 섹션 16/700 · 라벨 14/600 · 입력 16/400 · 자리표시 15 · 도움말 13 */
const LABEL = "mb-1.5 block text-[14px] font-semibold leading-snug text-sam-fg";
const INPUT =
  "sam-input w-full min-w-0 bg-sam-surface text-[16px] font-normal text-sam-fg placeholder:text-[15px] placeholder:text-sam-muted owner-store-profile-field-edge";
const TEXTAREA = `${INPUT} min-h-[5rem] resize-y py-2.5`;
const HELP = "mt-1.5 text-[13px] leading-snug text-sam-muted";
const COUNT = "mt-1 text-right text-[13px] tabular-nums text-sam-muted";
const OPTIONAL = "ml-1 text-[13px] font-normal text-sam-muted";
const OUTLINE_BTN = `inline-flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[15px] font-semibold text-sam-fg ${FORM_INTERACTIVE_PRESS_CLASS}`;
const CHIP_BASE = `inline-flex min-h-[44px] items-center gap-1.5 rounded-ui-rect border px-3 text-[15px] text-sam-fg ${FORM_INTERACTIVE_PRESS_CLASS}`;
const CHIP_ON = "border-2 border-sam-primary bg-sam-primary-soft font-bold";
const CHIP_OFF = "border-sam-border bg-sam-surface";
const SECTION_HEAD_FIX =
  "[&_.owner-store-admin-dash-section__header_h2]:text-[16px] [&_.owner-store-admin-dash-section__header_h2]:font-bold";
/** 하단 막힘 사유 줄 높이(사유 + 해결 버튼) — 마지막 입력이 바에 가리지 않게 */
const BLOCKED_REASON_LINE_PX = 44;
/** 이 화면은 고객센터 버튼을 켠다 — 버튼(44) + 바 위 간격(10) */
const SUPPORT_FAB_CLEARANCE_PX = 56;

const EMPTY: FormState = {
  applicantNickname: "",
  shopName: "",
  branchName: "",
  description: "",
  requestNote: "",
  kakaoId: "",
  categoryPrimarySlug: "",
  categorySubSlug: "",
  phoneVerification: null,
  location: null,
};

/** 신청 화면 진행 막대 — 「신청」 단계가 현재 */
const DRAFT_STEPS = STORE_APPLICATION_STEP_KEYS.map((key, i) => ({
  key,
  state: i === 0 ? ("current" as const) : ("todo" as const),
}));

function press(e: MouseEvent) {
  triggerInteractionFeedback("light", { pointerType: (e.nativeEvent as PointerEvent).pointerType });
}

function Req() {
  return (
    <span className="ml-0.5 font-bold text-sam-danger" aria-hidden>
      *
    </span>
  );
}

/**
 * 매장 입점 신청서 (매장 신청 v2 · Owner 「권장안으로 승인」 2026-11-10).
 * 신청자 → 매장 정보(이름·중복 확인·지점명·업종 칩·소개) → 매장 연락처(매장 전용 전화 인증) →
 * 매장 위치(실제 영업장 · 지도) → 요청 사항 → 입점·수수료 서약(약관 게시 때만).
 * `mode="revise"` = 보완 요청 매장의 「보완 내용 제출」 (같은 폼 · 저장된 값으로 시작).
 */
export function BusinessApplyForm({
  mode = "apply",
  storeId = null,
  initial = null,
  profileSeed = null,
  partnerRefreshKey = 0,
  onSubmit,
  submitLabel,
  disabled = false,
}: {
  mode?: "apply" | "revise";
  storeId?: string | null;
  initial?: BusinessApplyInitial | null;
  profileSeed?: BusinessApplyProfileSeed | null;
  partnerRefreshKey?: number;
  onSubmit: (values: BusinessApplyFormValues) => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const { keyboardOpen, formPadStyle, footerPadStyle, footerFixedClassName } = useOwnerAdminFormKeyboard();

  const [values, setValues] = useState<FormState>(() =>
    initial
      ? {
          applicantNickname: initial.applicantNickname,
          shopName: initial.shopName,
          branchName: initial.branchName,
          description: initial.description,
          requestNote: initial.requestNote,
          kakaoId: initial.kakaoId,
          categoryPrimarySlug: initial.categoryPrimarySlug,
          categorySubSlug: initial.categorySubSlug,
          phoneVerification: null,
          location: initial.location,
        }
      : EMPTY
  );
  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setValues((p) => ({ ...p, [k]: v }));
  }, []);

  /* ── 업종 (DB 업종 관리와 같은 이름·순서 · 칩 — 기기 드롭다운 아님) ── */
  const [taxonomy, setTaxonomy] = useState<{ categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } | null>(null);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [taxonomyRetry, setTaxonomyRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setTaxonomyError(false);
    void (async () => {
      try {
        const { json } = await fetchStoresTaxonomyDeduped();
        const j = json as { ok?: boolean; categories?: unknown; topics?: unknown };
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({ categories: j.categories as StoreTaxonomyCategory[], topics: j.topics as StoreTaxonomyTopic[] });
        } else setTaxonomyError(true);
      } catch {
        if (!cancelled) setTaxonomyError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taxonomyRetry]);
  const symbolBySlug = useMemo(() => new Map(listBrowsePrimaryIndustries().map((p) => [p.slug, p.symbol])), []);
  const primaries = useMemo(
    () => [...(taxonomy?.categories ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [taxonomy]
  );
  const selectedCategory = primaries.find((c) => c.slug === values.categoryPrimarySlug) ?? null;
  const topics = useMemo(
    () =>
      selectedCategory
        ? (taxonomy?.topics ?? [])
            .filter((tp) => tp.store_category_id === selectedCategory.id)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        : [],
    [taxonomy, selectedCategory]
  );
  const selectedTopic = topics.find((tp) => tp.slug === values.categorySubSlug) ?? null;
  const primaryLabel = selectedCategory
    ? resolveStoreTaxonomyPrimaryDisplayName(language, selectedCategory.slug, selectedCategory.name, selectedCategory.name_en)
    : "";
  const subLabel = selectedTopic
    ? resolveStoreTaxonomyTopicDisplayName(language, selectedTopic.slug, selectedTopic.name, selectedTopic.name_en)
    : "";

  /* ── 매장 이름 중복 확인 (입력 멈춘 뒤 0.5초 · 서버가 신청 때 다시 확인) ── */
  const [nameCheck, setNameCheck] = useState<{ name: string; dup: number } | null>(null);
  const [nameChecking, setNameChecking] = useState(false);
  const shopNameNorm = normalizeStoreApplyName(values.shopName);
  useEffect(() => {
    if (shopNameNorm.length < STORE_APPLY_LIMITS.shopNameMin) {
      setNameCheck(null);
      setNameChecking(false);
      return;
    }
    setNameChecking(true);
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      const qs = new URLSearchParams({ name: shopNameNorm });
      if (storeId) qs.set("excludeStoreId", storeId);
      void fetch(`/api/me/stores/name-check?${qs.toString()}`, { credentials: "include", signal: ctl.signal })
        .then((r) => r.json())
        .then((j: { ok?: boolean; duplicateCount?: number }) => {
          setNameCheck({ name: shopNameNorm, dup: j?.ok ? Number(j.duplicateCount ?? 0) : 0 });
          setNameChecking(false);
        })
        .catch(() => {
          if (!ctl.signal.aborted) setNameChecking(false);
        });
    }, 500);
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
    };
  }, [shopNameNorm, storeId]);
  const nameDup = nameCheck && nameCheck.name === shopNameNorm ? nameCheck.dup : 0;
  const branchNorm = normalizeStoreApplyName(values.branchName);
  const branchRequiredMissing = nameDup > 0 && !branchNorm;

  /* ── 매장 전화 · 위치 시트 ── */
  const [phoneSheet, setPhoneSheet] = useState(false);
  const [locationSheet, setLocationSheet] = useState(false);
  const shownPhone = values.phoneVerification?.phone ?? initial?.phone ?? "";
  const phoneVerifiedNow = Boolean(values.phoneVerification);
  const hasStorePhone = phoneVerifiedNow || (mode === "revise" && Boolean(initial?.phone));

  /* ── 서약 (신청 때만 · 보완은 운영 홈 카드) ── */
  const [partner, setPartner] = useState<BusinessApplyPartnerState>({
    required: false,
    input: null,
    loading: mode === "apply",
  });
  const partnerPledgePending =
    partner.required && !(partner.input?.agreeTerms === true && partner.input?.agreeFee === true);

  const blocked = resolveBusinessApplySubmitBlockedReason({
    applicantName: values.applicantNickname,
    shopName: values.shopName,
    branchRequiredMissing,
    categoryPrimarySlug: values.categoryPrimarySlug,
    categorySubSlug: values.categorySubSlug,
    hasStorePhone,
    hasLocation: Boolean(values.location),
    partnerLoading: mode === "apply" && partner.loading === true,
    partnerPledgePending: mode === "apply" && partnerPledgePending,
  });
  const submitDisabled = disabled || blocked != null || nameChecking;

  /* ── 막힘 사유 → 해당 칸으로 ── */
  const fieldRefs = useRef<Partial<Record<BusinessApplySubmitBlockedReason, HTMLElement | null>>>({});
  const reg = (k: BusinessApplySubmitBlockedReason) => (el: HTMLElement | null) => {
    fieldRefs.current[k] = el;
  };
  const fixBlocked = () => {
    if (!blocked) return;
    if (blocked === "phone") {
      setPhoneSheet(true);
      return;
    }
    if (blocked === "location") {
      setLocationSheet(true);
      return;
    }
    const el = fieldRefs.current[blocked];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el.querySelector<HTMLElement>("input,textarea,button");
    focusable?.focus({ preventScroll: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;
    onSubmit({ ...values, partnerAgreement: mode === "apply" && partner.required ? partner.input : null });
  };

  return (
    <>
      <form
        id="business-apply-form"
        onSubmit={handleSubmit}
        noValidate
        className={`${OWNER_STORE_STACK_Y_CLASS} ${SECTION_HEAD_FIX}`}
        style={{
          paddingBottom: `calc(${formPadStyle.paddingBottom} + ${
            !disabled && blocked ? BLOCKED_REASON_LINE_PX : 0
          }px + ${SUPPORT_FAB_CLEARANCE_PX}px)`,
        }}
        data-apply-mode={mode}
      >
        {mode === "apply" ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <StoreApplicationProgressBar steps={DRAFT_STEPS} />
          </div>
        ) : initial?.revisionNote ? (
          <div className="rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft p-3 text-[14px] text-sam-fg" role="note">
            <p className="font-bold">{t("store_apply_revise_note_title")}</p>
            <p className="mt-1 whitespace-pre-wrap">{initial.revisionNote}</p>
          </div>
        ) : null}

        {/* 신청자 */}
        <OwnerStoreAdminDashSection title={t("store_apply_section_applicant")}>
          <div ref={reg("name")}>
            <label className={LABEL} htmlFor="apply-legal-name">
              {t("business_phase7_180")}
              <Req />
            </label>
            <input
              id="apply-legal-name"
              type="text"
              value={values.applicantNickname}
              onChange={(e) => set("applicantNickname", e.target.value.slice(0, STORE_APPLY_LIMITS.applicantMax))}
              maxLength={STORE_APPLY_LIMITS.applicantMax}
              autoComplete="name"
              aria-required
              className={INPUT}
              placeholder={t("store_apply_applicant_placeholder")}
            />
            <p className={HELP}>{t("store_apply_applicant_help")}</p>
          </div>
          {profileSeed?.username ? (
            <p className="text-[15px] font-semibold text-sam-fg">
              <span className="mr-2 text-[13px] font-normal text-sam-muted">{t("store_apply_member_id")}</span>@
              {profileSeed.username}
            </p>
          ) : null}
        </OwnerStoreAdminDashSection>

        {/* 매장 정보 */}
        <OwnerStoreAdminDashSection title={t("store_apply_section_store")}>
          <div ref={reg("shop_name")}>
            <label className={LABEL} htmlFor="apply-shop-name">
              {t("store_apply_shop_name")}
              <Req />
            </label>
            <input
              id="apply-shop-name"
              type="text"
              value={values.shopName}
              onChange={(e) => set("shopName", e.target.value.slice(0, STORE_APPLY_LIMITS.shopNameMax))}
              maxLength={STORE_APPLY_LIMITS.shopNameMax}
              aria-required
              className={INPUT}
              placeholder={t("store_apply_shop_name_placeholder")}
            />
            {shopNameNorm.length < STORE_APPLY_LIMITS.shopNameMin ? (
              <p className={HELP}>{t("store_apply_shop_name_help")}</p>
            ) : nameChecking ? (
              <p className={HELP}>{t("store_apply_name_checking")}</p>
            ) : nameDup > 0 ? (
              <p className="mt-1.5 text-[13px] font-medium text-sam-warning" role="status">
                {t("store_apply_name_dup")}
              </p>
            ) : nameCheck ? (
              <p className="mt-1.5 text-[13px] font-medium text-sam-success" role="status">
                {t("store_apply_name_ok")}
              </p>
            ) : null}
          </div>
          {nameDup > 0 || branchNorm ? (
            <div ref={reg("branch")}>
              <label className={LABEL} htmlFor="apply-branch">
                {t("store_apply_branch")}
                {nameDup > 0 ? <Req /> : <span className={OPTIONAL}>{t("store_apply_optional")}</span>}
              </label>
              <input
                id="apply-branch"
                type="text"
                value={values.branchName}
                onChange={(e) => set("branchName", e.target.value.slice(0, STORE_APPLY_LIMITS.branchMax))}
                maxLength={STORE_APPLY_LIMITS.branchMax}
                className={INPUT}
                placeholder={t("store_apply_branch_placeholder")}
              />
              <p className={HELP}>
                {branchNorm
                  ? t("store_apply_branch_preview", { name: `${shopNameNorm} ${branchNorm}` })
                  : t("store_apply_branch_help")}
              </p>
            </div>
          ) : null}

          <div ref={reg("category")}>
            <p className={LABEL}>
              {t("store_apply_category")}
              <Req />
            </p>
            {taxonomyError ? (
              <div className="space-y-2">
                <p className="text-[13px] text-sam-danger" role="alert">
                  {t("store_apply_category_load_failed")}
                </p>
                <button
                  type="button"
                  className={OUTLINE_BTN}
                  onClick={(e) => {
                    press(e);
                    setTaxonomyRetry((n) => n + 1);
                  }}
                >
                  {t("partner_retry_btn")}
                </button>
              </div>
            ) : !taxonomy ? (
              <p className={HELP}>{t("common_loading")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("store_apply_category")}>
                  {primaries.map((c) => {
                    const on = c.slug === values.categoryPrimarySlug;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={(e) => {
                          press(e);
                          if (!on) setValues((p) => ({ ...p, categoryPrimarySlug: c.slug, categorySubSlug: "" }));
                        }}
                        className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
                        data-category={c.slug}
                      >
                        <span aria-hidden>{symbolBySlug.get(c.slug) ?? "🏷️"}</span>
                        <span className="min-w-0 truncate">
                          {resolveStoreTaxonomyPrimaryDisplayName(language, c.slug, c.name, c.name_en)}
                        </span>
                        {on ? (
                          <span className="ml-auto text-sam-primary" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {selectedCategory ? (
                  <>
                    <p className="mb-1.5 mt-3 text-[13px] font-semibold text-sam-muted">{t("store_apply_category_sub")}</p>
                    {topics.length === 0 ? (
                      <p className={HELP}>{t("store_apply_category_sub_empty")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("store_apply_category_sub")}>
                        {topics.map((tp) => {
                          const on = tp.slug === values.categorySubSlug;
                          return (
                            <button
                              key={tp.id}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={(e) => {
                                press(e);
                                set("categorySubSlug", tp.slug);
                              }}
                              className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
                              data-topic={tp.slug}
                            >
                              {resolveStoreTaxonomyTopicDisplayName(language, tp.slug, tp.name, tp.name_en)}
                              {on ? (
                                <span className="text-sam-primary" aria-hidden>
                                  ✓
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className={HELP}>{t("store_apply_category_pick_first")}</p>
                )}
              </>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor="apply-description">
              {t("store_apply_description")}
              <span className={OPTIONAL}>{t("store_apply_optional")}</span>
            </label>
            <textarea
              id="apply-description"
              value={values.description}
              onChange={(e) => set("description", e.target.value.slice(0, STORE_APPLY_LIMITS.descriptionMax))}
              rows={3}
              className={TEXTAREA}
              placeholder={t("store_apply_description_placeholder")}
            />
            <p className={COUNT}>{`${values.description.trim().length}/${STORE_APPLY_LIMITS.descriptionMax}`}</p>
          </div>
        </OwnerStoreAdminDashSection>

        {/* 매장 연락처 — 매장 전용 전화 인증 (회원 전화와 분리) */}
        <OwnerStoreAdminDashSection title={t("store_apply_section_contact")}>
          <div ref={reg("phone")}>
            <p className={LABEL}>
              {t("store_apply_phone_label")}
              <Req />
            </p>
            {shownPhone ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold tabular-nums text-sam-fg">
                  {formatPhMobileDisplayPlus63(shownPhone)}
                </span>
                {phoneVerifiedNow || initial?.phoneVerifiedAt ? (
                  <span className="rounded-full bg-sam-success-soft px-2.5 py-0.5 text-[12px] font-bold text-sam-success">
                    {t("store_apply_phone_verified")}
                  </span>
                ) : (
                  <span className="rounded-full bg-sam-surface-muted px-2.5 py-0.5 text-[12px] font-bold text-sam-muted">
                    {t("store_apply_phone_no_record")}
                  </span>
                )}
                <button
                  type="button"
                  className={`${OUTLINE_BTN} ml-auto`}
                  onClick={(e) => {
                    press(e);
                    setPhoneSheet(true);
                  }}
                >
                  {t("store_apply_phone_change")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`${OUTLINE_BTN} w-full`}
                onClick={(e) => {
                  press(e);
                  setPhoneSheet(true);
                }}
                data-testid="business-apply-phone-verify"
              >
                {t("store_apply_phone_verify_btn")}
              </button>
            )}
            <p className={HELP}>{t("store_apply_phone_help")}</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="apply-kakao">
              {t("store_apply_kakao")}
              <span className={OPTIONAL}>{t("store_apply_optional")}</span>
            </label>
            <input
              id="apply-kakao"
              type="text"
              value={values.kakaoId}
              onChange={(e) => set("kakaoId", e.target.value.slice(0, STORE_APPLY_LIMITS.kakaoMax))}
              className={INPUT}
              placeholder={t("business_phase7_193")}
            />
          </div>
        </OwnerStoreAdminDashSection>

        {/* 매장 위치 (실제 영업장 · 지도) — 회원 주소록과 구분 */}
        <OwnerStoreAdminDashSection title={t("store_apply_section_location")}>
          <div ref={reg("location")}>
            <p className="text-[13px] leading-snug text-sam-muted">{t("store_apply_location_help")}</p>
            {values.location ? (
              <div className="mt-2 rounded-ui-rect border border-sam-border px-3 py-2.5">
                <p className="text-[15px] font-semibold text-sam-fg">{values.location.formattedAddress}</p>
                {values.location.detail ? <p className="mt-0.5 text-[14px] text-sam-fg">{values.location.detail}</p> : null}
                <p className="mt-1 text-[12px] text-sam-muted">{t("store_apply_location_pinned")}</p>
              </div>
            ) : null}
            <button
              type="button"
              className={`${OUTLINE_BTN} mt-2 w-full`}
              onClick={(e) => {
                press(e);
                setLocationSheet(true);
              }}
              data-testid="business-apply-location-pick"
            >
              {values.location ? t("store_apply_location_change") : t("store_apply_location_pick")}
            </button>
          </div>
        </OwnerStoreAdminDashSection>

        {/* 요청 사항 */}
        <OwnerStoreAdminDashSection title={t("business_phase7_693")}>
          <div>
            <label className={LABEL} htmlFor="apply-request-note">
              {t("store_apply_request_note")}
              <span className={OPTIONAL}>{t("store_apply_optional")}</span>
            </label>
            <textarea
              id="apply-request-note"
              value={values.requestNote}
              onChange={(e) => set("requestNote", e.target.value.slice(0, STORE_APPLY_LIMITS.requestNoteMax))}
              rows={4}
              className={TEXTAREA}
              placeholder={t("business_phase7_695")}
            />
            <p className={COUNT}>{`${values.requestNote.trim().length}/${STORE_APPLY_LIMITS.requestNoteMax}`}</p>
          </div>
        </OwnerStoreAdminDashSection>

        {mode === "apply" ? (
          <div ref={reg("partner")}>
            <BusinessApplyPartnerSection
              categoryPrimarySlug={values.categoryPrimarySlug}
              categorySubSlug={values.categorySubSlug}
              primaryLabel={primaryLabel}
              subLabel={subLabel}
              refreshKey={partnerRefreshKey}
              onStateChange={setPartner}
            />
          </div>
        ) : null}
      </form>

      <StorePhoneVerifySheet
        open={phoneSheet}
        onClose={() => setPhoneSheet(false)}
        purpose="store_apply"
        storeId={storeId}
        initialPhone={shownPhone}
        onVerified={(v) => set("phoneVerification", v)}
      />
      <StoreLocationPickSheet
        open={locationSheet}
        onClose={() => setLocationSheet(false)}
        initial={values.location}
        onConfirm={(loc) => set("location", loc)}
      />

      <BodyPortal>
        <footer
          role="contentinfo"
          aria-label={t("business_phase7_177")}
          data-form-keyboard-footer="1"
          data-form-keyboard-open={keyboardOpen ? "true" : "false"}
          className={footerFixedClassName}
          style={footerPadStyle}
        >
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            {!disabled && blocked ? (
              <div className="flex items-center justify-between gap-2 border-b border-sam-border px-3 py-1.5">
                <p
                  className="min-w-0 truncate text-[13px] font-medium leading-5 text-sam-fg"
                  role="status"
                  data-testid="business-apply-submit-blocked-reason"
                >
                  {t(BUSINESS_APPLY_SUBMIT_BLOCKED_MESSAGE_KEY[blocked])}
                </p>
                {BUSINESS_APPLY_SUBMIT_BLOCKED_FIX_KEY[blocked] ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      press(e);
                      fixBlocked();
                    }}
                    className={`inline-flex min-h-[32px] shrink-0 items-center rounded-ui-rect border border-sam-primary px-2.5 text-[13px] font-bold text-sam-primary ${FORM_INTERACTIVE_PRESS_CLASS}`}
                  >
                    {t(BUSINESS_APPLY_SUBMIT_BLOCKED_FIX_KEY[blocked]!)}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => runHistoryBackWithFallback(router, "/mypage")}
                onPointerDown={(e) => {
                  if (!disabled) triggerInteractionFeedback("light", e);
                }}
                className={`${OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS} ${FORM_INTERACTIVE_PRESS_CLASS} text-[16px]`}
              >
                {t("common_cancel")}
              </button>
              <button
                type="submit"
                form="business-apply-form"
                disabled={submitDisabled}
                onPointerDown={(e) => {
                  if (!submitDisabled) triggerInteractionFeedback("light", e);
                }}
                className={`${OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS} ${OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS} ${FORM_INTERACTIVE_PRESS_CLASS} text-[16px] font-bold`}
              >
                {submitLabel ?? (mode === "revise" ? t("store_apply_revise_submit") : t("business_phase7_679"))}
              </button>
            </div>
          </div>
        </footer>
      </BodyPortal>
    </>
  );
}

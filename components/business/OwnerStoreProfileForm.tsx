"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS,
  OWNER_STORE_PROFILE_FIELD_EDGE_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_SELECT_CLASS,
  OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS,
  OWNER_STORE_PROFILE_TIME_BUTTON_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerStoreAdminLeavePromptModal } from "@/components/business/owner/OwnerStoreAdminLeavePromptModal";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import { fetchDeliveryRideTimeSourceDeduped } from "@/lib/app/delivery-ride-time-source-client";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import {
  clampStorePrepMinutes,
  parseCommerceExtrasFromHoursJson,
  parsePrepMinutesLegacyFromEstPrepLabel,
  type StoreDeliveryFeeMode,
} from "@/lib/stores/store-commerce-extras";
import { readPublicNoticesFromBusinessRecord } from "@/lib/stores/store-detail-meta";
import {
  formatStoreAddressDetailOnly,
  formatStoreAddressStreetDisplay,
} from "@/lib/stores/store-location-label";
import {
  formatPaymentMethodsDisplayLine,
  paymentMethodsConfigPayload,
  readPaymentMethodsFormValues,
} from "@/lib/stores/payment-methods-config";
import {
  normalizeHHMM,
  readAutoBusinessHoursEnabled,
  readAutoHoursFormFields,
  readBreakHoursFormFields,
  STORE_AUTO_TIMEZONE_OPTIONS,
} from "@/lib/stores/store-auto-hours";
import { applyAutoBusinessHoursToRecord } from "@/lib/stores/serialize-store-business-hours-json";
import { invalidateStorePublicCachesForSlug } from "@/lib/stores/store-public-cache-invalidate";
import { TumblerTimePickerDialog } from "@/components/ui/TumblerTimePickerDialog";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-footer-actions";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import {
  OWNER_BASIC_INFO_LEAVE_EVENT,
  setOwnerBasicInfoDirty,
  type OwnerBasicInfoLeaveDetail,
} from "@/lib/business/owner-basic-info-guard";
import { formatHHmm12hLabel } from "@/lib/utils/tumbler-time";
import { formatPriceInput } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  formatOwnerStoreImageUploadError,
  formatOwnerStorePatchError,
  ownerStoreTimezoneLabel,
} from "@/lib/business/owner-store-patch-error-i18n";
const GALLERY_MAX = 16;

const OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS =
  "-mx-4 mb-4 block border-b border-[var(--biz-primary-active)] bg-[var(--biz-primary)] px-4 py-3 text-[13px] font-bold leading-snug text-[var(--biz-cream)]";

const OWNER_STORE_PROFILE_FIELD_SHELL_CLASS = `${OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS} border-[var(--biz-card-border)] bg-[var(--biz-card-bg)]`;

const OWNER_STORE_PROFILE_CHECKBOX_CLASS =
  "mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--biz-card-border)] text-[var(--biz-primary)] accent-[var(--biz-primary)]";

const OWNER_STORE_PROFILE_CHECKBOX_ROW_CLASS =
  "flex min-h-[60px] cursor-pointer items-start gap-3 rounded-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-4 py-3 transition-colors hover:border-[var(--biz-primary)]/45 active:bg-[var(--biz-primary-soft)]";

const OWNER_STORE_PROFILE_BIZ_INNER_PANEL_CLASS =
  "space-y-4 rounded-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-4 py-4";

function intStrFromJson(o: Record<string, unknown>, snake: string, camel: string): string {
  const v = o[snake] ?? o[camel];
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n));
}

function readPublicCommerceFields(raw: unknown) {
  const o = coerceBusinessHoursRecord(raw);
  const hoursNote =
    typeof o.holidays === "string" && o.holidays.trim()
      ? o.holidays
      : typeof o.note === "string"
        ? o.note
        : "";
  const s = (a: string, b: string) =>
    String(o[a] ?? o[b] ?? "")
      .trim()
      .replace(/\r\n/g, "\n");
  const prepFromJson = intStrFromJson(o, "prep_time_minutes", "prepTimeMinutes");
  const estLegacy = s("est_prep_label", "estPrepLabel");
  const prepTimeMinutes =
    prepFromJson ||
    (() => {
      const parsed = estLegacy ? parsePrepMinutesLegacyFromEstPrepLabel(estLegacy) : null;
      return parsed != null ? String(parsed) : "";
    })();
  const minRaw = intStrFromJson(o, "min_order_php", "minOrderPhp");
  const extras = parseCommerceExtrasFromHoursJson(o);
  const deliveryFeeMode: StoreDeliveryFeeMode =
    extras.deliveryFeeMode === "courier"
      ? "courier"
      : extras.deliveryFeeMode === "self_free_promo"
        ? "self_free_promo"
        : "self";
  /** ??? ??: JSON? ?? ??? ?? ?? ?? ?? ?? ??? ?? ??? ??? ?? */
  const freeRaw = intStrFromJson(o, "free_delivery_over_php", "freeDeliveryOverPhp");
  return {
    hoursNote,
    publicNotices: readPublicNoticesFromBusinessRecord(raw),
    freeDeliveryOverPhp: freeRaw ? formatPriceInput(freeRaw) : "",
    deliveryNotice: s("delivery_notice", "deliveryNotice"),
    avgChatResponse: s("avg_chat_response", "avgChatResponse"),
    minOrderPhp: minRaw ? formatPriceInput(minRaw) : "",
    deliveryFeeMode,
    deliveryFeePhp:
      extras.deliveryFeePhp != null ? formatPriceInput(String(extras.deliveryFeePhp)) : "",
    deliveryFeeStrikeReferencePhp:
      extras.deliveryFeeStrikeReferencePhp != null
        ? formatPriceInput(String(extras.deliveryFeeStrikeReferencePhp))
        : "",
    deliveryCourierLabel: (extras.deliveryCourierLabel ?? "").trim(),
    deliveryRideDisplayManual: String(o.delivery_ride_display_manual ?? o.deliveryRideDisplayManual ?? "")
      .trim()
      .slice(0, 80),
    prepTimeMinutes,
  };
}

export type OwnerStoreProfileFormValues = {
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  addressStreetLine: string;
  addressDetail: string;
  category: string;
  email: string;
  websiteUrl: string;
  isOpen: boolean;
  profileImageUrl: string;
  deliveryAvailable: boolean;
  /** ?? ????? ??? ?? ???? ?? */
  menuSoldOutBottom: boolean;
  pickupAvailable: boolean;
  hoursNote: string;
  /** ?? ? ???? ? business_hours_json.auto_business_hours */
  autoBusinessHoursEnabled: boolean;
  autoHoursTz: string;
  autoHoursOpen: string;
  autoHoursClose: string;
  /** ?? ??????? ??/?? JSON ?? */
  payMethodGcash: boolean;
  payMethodCashMeet: boolean;
  payMethodBank: boolean;
  payMethodOtherEnabled: boolean;
  payMethodOtherText: string;
  /** ?? ? ?? ? ??? ?? ? */
  publicNotices: string[];
  freeDeliveryOverPhp: string;
  deliveryNotice: string;
  /** ????? ?? ??(?) ? `business_hours_json.prep_time_minutes` */
  prepTimeMinutes: string;
  /** ?? ?? ? ?? ??? ?? UI??? */
  breakHoursEnabled: boolean;
  breakHoursStart: string;
  breakHoursEnd: string;
  avgChatResponse: string;
  minOrderPhp: string;
  /** ????(? ??) vs ????(???? ???) ? ?? ?? */
  deliveryFeeMode: StoreDeliveryFeeMode;
  deliveryFeePhp: string;
  /** self_free_promo: ?? ???? ?? ???(??) */
  deliveryFeeStrikeReferencePhp: string;
  deliveryCourierLabel: string;
  /** ?? ?? ?? ??? ? ???ETA ?? ?? ?? ? `delivery_ride_display_manual` */
  deliveryRideDisplayManual: string;
  latStr: string;
  lngStr: string;
  galleryUrls: string[];
};

/** ???? ???????? ??? ? ???? ???? ?? ??? ???? ?? */
function hasPersistedPublicCommerceDetail(v: OwnerStoreProfileFormValues): boolean {
  if (
    v.payMethodGcash ||
    v.payMethodCashMeet ||
    v.payMethodBank ||
    v.payMethodOtherEnabled ||
    v.payMethodOtherText.trim()
  ) {
    return true;
  }
  if (v.minOrderPhp.trim()) return true;
  if (v.deliveryFeePhp.trim()) return true;
  if (v.deliveryFeeStrikeReferencePhp.trim()) return true;
  if (v.deliveryCourierLabel.trim()) return true;
  if (v.deliveryRideDisplayManual.trim()) return true;
  if (v.freeDeliveryOverPhp.trim()) return true;
  if (v.publicNotices.some((t) => t.trim())) return true;
  if (v.deliveryNotice.trim()) return true;
  if (v.avgChatResponse.trim()) return true;
  if (v.prepTimeMinutes.trim()) return true;
  return false;
}

function rowToFormValues(row: StoreRow): OwnerStoreProfileFormValues {
  const { intro, kakao } = splitStoreDescriptionAndKakao(row.description, row.kakao_id ?? null);
  const street = formatStoreAddressStreetDisplay({
    district: row.district,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
  });
  const detail = formatStoreAddressDetailOnly(row.address_line2);
  const lat = row.lat != null && Number.isFinite(Number(row.lat)) ? String(row.lat) : "";
  const lng = row.lng != null && Number.isFinite(Number(row.lng)) ? String(row.lng) : "";
  const br = readBreakHoursFormFields(row.business_hours_json);
  const brS = normalizeHHMM(br.breakHoursStart.trim());
  const brE = normalizeHHMM(br.breakHoursEnd.trim());
  const breakOn = !!brS && !!brE && brS !== brE;
  return {
    shopName: row.store_name ?? "",
    description: intro ?? "",
    phone: row.phone ?? "",
    kakaoId: kakao ?? "",
    region: row.region ?? "",
    city: row.city ?? "",
    addressStreetLine: street,
    addressDetail: detail,
    category: row.business_type ?? "",
    email: parsePhMobileInput(row.email ?? ""),
    websiteUrl: row.website_url ?? "",
    isOpen: row.is_open !== false,
    profileImageUrl: row.profile_image_url ?? "",
    deliveryAvailable: row.delivery_available === true,
    menuSoldOutBottom: row.menu_sold_out_bottom === true,
    pickupAvailable: row.pickup_available !== false,
    ...readAutoHoursFormFields(row.business_hours_json),
    autoBusinessHoursEnabled: readAutoBusinessHoursEnabled(row.business_hours_json),
    breakHoursEnabled: breakOn,
    breakHoursStart: br.breakHoursStart,
    breakHoursEnd: br.breakHoursEnd,
    ...readPublicCommerceFields(row.business_hours_json),
    ...readPaymentMethodsFormValues(row.business_hours_json),
    latStr: lat,
    lngStr: lng,
    galleryUrls: parseMediaUrlsJson(row.gallery_images_json, GALLERY_MAX),
  };
}

function serializeProfileSnapshot(v: OwnerStoreProfileFormValues): string {
  return JSON.stringify(v);
}

/** ?? ?? ??? = ?? ? ??? ?? JSON (`public_notices` ?). */
function buildBusinessHoursJson(
  row: StoreRow,
  values: OwnerStoreProfileFormValues
): Record<string, unknown> {
  const prev = { ...coerceBusinessHoursRecord(row.business_hours_json) };
  const drop = [
    "weekdays",
    "weekdays_hours",
    "note",
    "holidays",
    "holiday",
    "closed_days",
    "휴무",
    "payment_methods",
    "paymentMethods",
    "payment_methods_config",
    "paymentMethodsConfig",
    "promo_banner",
    "promoBanner",
    "public_notices",
    "publicNotices",
    "free_delivery_over_php",
    "freeDeliveryOverPhp",
    "delivery_notice",
    "deliveryNotice",
    "prep_time_minutes",
    "prepTimeMinutes",
    "avg_delivery_time",
    "avgDeliveryTime",
    "break_time",
    "breakTime",
    "break_hours",
    "breakHours",
    "avg_chat_response",
    "avgChatResponse",
    "min_order_php",
    "minOrderPhp",
    "delivery_fee_php",
    "deliveryFeePhp",
    "delivery_fee_mode",
    "deliveryFeeMode",
    "delivery_fee_strike_reference_php",
    "deliveryFeeStrikeReferencePhp",
    "delivery_courier_label",
    "deliveryCourierLabel",
    "delivery_ride_display_manual",
    "deliveryRideDisplayManual",
    "est_prep_label",
    "estPrepLabel",
    "auto_business_hours",
    "autoBusinessHours",
  ] as const;
  for (const k of drop) delete prev[k];

  const n = values.hoursNote.trim();
  if (n) {
    // Buyer public info reads `holidays|holiday|closed_days|휴무` — keep `note` for legacy rows.
    prev.holidays = n;
    prev.note = n;
  }

  const paySlice = {
    payMethodGcash: values.payMethodGcash,
    payMethodCashMeet: values.payMethodCashMeet,
    payMethodBank: values.payMethodBank,
    payMethodOtherEnabled: values.payMethodOtherEnabled,
    payMethodOtherText: values.payMethodOtherText,
  };
  const payLine = formatPaymentMethodsDisplayLine(paySlice);
  if (payLine.trim()) prev.payment_methods = payLine;
  const payCfg = paymentMethodsConfigPayload(paySlice);
  if (payCfg) prev.payment_methods_config = payCfg;
  const notices = values.publicNotices.map((t) => t.trim()).filter(Boolean);
  if (notices.length > 0) {
    prev.public_notices = notices;
    prev.promo_banner = notices[0];
  }
  if (values.deliveryFeeMode === "self") {
    const fo = values.freeDeliveryOverPhp.replace(/\D/g, "").trim();
    if (fo) {
      const x = Math.round(Number(fo));
      if (Number.isFinite(x) && x > 0) prev.free_delivery_over_php = x;
    }
  }
  const dn = values.deliveryNotice.trim();
  if (dn) prev.delivery_notice = dn;
  const pmRaw = values.prepTimeMinutes.trim();
  if (pmRaw) {
    const n = Math.round(Number(pmRaw));
    if (Number.isFinite(n) && n > 0) {
      const c = clampStorePrepMinutes(n);
      prev.prep_time_minutes = c;
      prev.est_prep_label = `${c}?`;
    }
  }
  const drm = values.deliveryRideDisplayManual.trim().slice(0, 80);
  if (drm) prev.delivery_ride_display_manual = drm;
  if (values.breakHoursEnabled) {
    const bs = normalizeHHMM(values.breakHoursStart.trim());
    const be = normalizeHHMM(values.breakHoursEnd.trim());
    if (bs && be && bs !== be) {
      prev.break_hours = { start: bs, end: be };
      prev.break_time = `${bs}?${be}`;
    }
  }
  const ch = values.avgChatResponse.trim();
  if (ch) prev.avg_chat_response = ch;
  const mo = values.minOrderPhp.replace(/\D/g, "").trim();
  if (mo) {
    const x = Math.round(Number(mo));
    if (Number.isFinite(x) && x >= 0) prev.min_order_php = x;
  }
  if (values.deliveryFeeMode === "self") {
    prev.delivery_fee_mode = "self";
    const df = values.deliveryFeePhp.replace(/\D/g, "").trim();
    if (df !== "") {
      const x = Math.round(Number(df));
      if (Number.isFinite(x) && x >= 0) prev.delivery_fee_php = x;
    }
  } else if (values.deliveryFeeMode === "self_free_promo") {
    prev.delivery_fee_mode = "self_free_promo";
    const sr = values.deliveryFeeStrikeReferencePhp.replace(/\D/g, "").trim();
    if (sr !== "") {
      const x = Math.round(Number(sr));
      if (Number.isFinite(x) && x > 0) prev.delivery_fee_strike_reference_php = x;
    }
  } else {
    prev.delivery_fee_mode = "courier";
    const dc = values.deliveryCourierLabel.trim();
    if (dc) prev.delivery_courier_label = dc;
  }

  applyAutoBusinessHoursToRecord(prev, {
    autoBusinessHoursEnabled: values.autoBusinessHoursEnabled,
    autoHoursTz: values.autoHoursTz,
    autoHoursOpen: values.autoHoursOpen,
    autoHoursClose: values.autoHoursClose,
  });

  return prev;
}


interface OwnerStoreProfileFormProps {
  storeId: string;
  storeSlug: string;
  row: StoreRow;
  onSaved: () => void;
  /** ??? ????? ?? ? ?? ??(?? ?)? ??? */
  onServiceDraftChange?: (d: { deliveryAvailable: boolean; pickupAvailable: boolean }) => void;
}

export function OwnerStoreProfileForm({
  storeId,
  storeSlug,
  row,
  onSaved,
  onServiceDraftChange,
}: OwnerStoreProfileFormProps) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const hideAppBottomNav =
    (pathname?.startsWith("/my/settings") ?? false) ||
    pathname === "/my/logout" ||
    isProfileEditPath(pathname);
  const shellFlags = useMemo(
    () => resolveConditionalAppShellFlags(pathname ?? "", false),
    [pathname]
  );
  const dockActionBarAboveMainBottomNav =
    !hideAppBottomNav && shellFlags.showBottomNav;

  const {
    keyboardOpen,
    effectiveViewportBottom,
    formPadStyle,
    footerPadStyle,
    footerFixedClassName,
  } = useOwnerAdminFormKeyboard({ aboveBottomNav: dockActionBarAboveMainBottomNav });
  useFormKeyboardFocusVisibility({ effectiveViewportBottom });

  const [values, setValues] = useState<OwnerStoreProfileFormValues>(() => rowToFormValues(row));
  const [publicCommerceDetailOpen, setPublicCommerceDetailOpen] = useState(() =>
    hasPersistedPublicCommerceDetail(rowToFormValues(row))
  );
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<"gallery" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<
    "open" | "close" | "breakOpen" | "breakClose" | null
  >(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<OwnerBasicInfoLeaveDetail | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [globalRideTimeSource, setGlobalRideTimeSource] = useState<"store" | "google" | null>(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    const next = rowToFormValues(row);
    setValues(next);
    setPublicCommerceDetailOpen(hasPersistedPublicCommerceDetail(next));
    queueMicrotask(() => {
      setBaselineSnapshot(serializeProfileSnapshot(next));
    });
  }, [row]);

  const isDirty =
    baselineSnapshot != null &&
    serializeProfileSnapshot(valuesRef.current) !== baselineSnapshot;

  const saveConfirmDescription = useMemo(
    () => `${t("business_phase7_697")} ${t("business_phase7_530")}`.trim(),
    [t],
  );

  useEffect(() => {
    setOwnerBasicInfoDirty(isDirty);
    return () => setOwnerBasicInfoDirty(false);
  }, [isDirty]);

  useEffect(() => {
    const onLeave = (ev: Event) => {
      const detail = (ev as CustomEvent<OwnerBasicInfoLeaveDetail>).detail;
      if (detail?.href) setLeavePrompt(detail);
    };
    window.addEventListener(OWNER_BASIC_INFO_LEAVE_EVENT, onLeave);
    return () => window.removeEventListener(OWNER_BASIC_INFO_LEAVE_EVENT, onLeave);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [isDirty]);

  useEffect(() => {
    onServiceDraftChange?.({
      deliveryAvailable: values.deliveryAvailable,
      pickupAvailable: values.pickupAvailable,
    });
  }, [values.deliveryAvailable, values.pickupAvailable, onServiceDraftChange]);

  useEffect(() => {
    let cancelled = false;
    void fetchDeliveryRideTimeSourceDeduped().then((source) => {
      if (!cancelled) setGlobalRideTimeSource(source);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadGalleryImage = async (file: File) => {
    setUploading("gallery");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/upload-image`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || !j.url) {
        setError(formatOwnerStoreImageUploadError(j, language));
        return;
      }
      setValues((v) => {
        const filled = v.galleryUrls.map((x) => x.trim()).filter(Boolean);
        const next = [...filled, String(j.url).trim()].filter(Boolean).slice(0, GALLERY_MAX);
        return { ...v, galleryUrls: next };
      });
    } catch {
      setError(t("business_phase7_521"));
    } finally {
      setUploading(null);
    }
  };

  const revertToSaved = useCallback(() => {
    setError(null);
    const next = rowToFormValues(row);
    setValues(next);
    setPublicCommerceDetailOpen(hasPersistedPublicCommerceDetail(next));
    setBaselineSnapshot(serializeProfileSnapshot(next));
  }, [row]);

  const runSave = async (options?: { skipPrompt?: boolean }): Promise<boolean> => {
    try {
      setError(null);
      const business_hours_json = buildBusinessHoursJson(row, values);
      const gallery_images_json = values.galleryUrls.map((u) => u.trim()).filter(Boolean);
      if (gallery_images_json.length > GALLERY_MAX) {
        setError(t("business_phase7_526", { v1: GALLERY_MAX }));
        return false;
      }
      if (values.autoBusinessHoursEnabled) {
        const o = normalizeHHMM(values.autoHoursOpen.trim());
        const c = normalizeHHMM(values.autoHoursClose.trim());
        if (!o || !c || o === c) {
          setError(t("business_phase7_522"));
          return false;
        }
      }
      if (values.breakHoursEnabled) {
        const bs = normalizeHHMM(values.breakHoursStart.trim());
        const be = normalizeHHMM(values.breakHoursEnd.trim());
        if (!bs || !be || bs === be) {
          setError(t("business_phase7_523"));
          return false;
        }
      }
      if (values.deliveryFeeMode === "courier" && !values.deliveryCourierLabel.trim()) {
        setError(t("business_phase7_524"));
        return false;
      }
      if (values.deliveryFeeMode === "self_free_promo") {
        const sr = values.deliveryFeeStrikeReferencePhp.replace(/\D/g, "").trim();
        const x = sr ? Math.round(Number(sr)) : NaN;
        if (!Number.isFinite(x) || x <= 0) {
          setError(t("business_phase7_525"));
          return false;
        }
      }
      if (!options?.skipPrompt) {
        setSaveConfirmOpen(true);
        return false;
      }
      setSubmitting(true);
      try {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            /** ??????? ?? ? ??. ???????????? ?? ?? ?? ????? PATCH */
            is_open: values.isOpen,
            delivery_available: values.deliveryAvailable,
            menu_sold_out_bottom: values.menuSoldOutBottom,
            pickup_available: values.pickupAvailable,
            business_hours_json,
            gallery_images_json,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError(t("common_login_required"));
          return false;
        }
        if (!j?.ok || !j?.store) {
          const code = typeof j?.error === "string" ? j.error : "";
          const mapped = formatOwnerStorePatchError(code, language);
          setError(
            j?.ok && !j?.store
              ? t("business_phase7_520")
              : mapped ?? (code ? code : t("business_phase7_517"))
          );
          return false;
        }
        invalidateStorePublicCachesForSlug(storeSlug);
        onSaved();
        return true;
      } catch {
        setError(t("business_phase7_518"));
        return false;
      } finally {
        setSubmitting(false);
      }
    } catch (err) {
      console.error("[OwnerStoreProfileForm] runSave", err);
      setError(t("business_phase7_519"));
      setSubmitting(false);
      return false;
    }
  };

  const saveStoreProfile = async () => {
    await runSave();
  };

  const confirmLeaveWithSave = async () => {
    if (!leavePrompt) return;
    setLeaveSaving(true);
    try {
      const ok = await runSave({ skipPrompt: true });
      if (ok) {
        const href = leavePrompt.href;
        setLeavePrompt(null);
        router.push(href);
      }
    } finally {
      setLeaveSaving(false);
    }
  };

  /** ?? ????: ?? ?? ? ??/????? ??? ??? ?? */
  const confirmLeaveDiscard = useCallback(() => {
    if (!leavePrompt) return;
    const href = leavePrompt.href;
    setLeavePrompt(null);
    revertToSaved();
    router.push(href);
  }, [leavePrompt, revertToSaved, router]);

  const timePickerValue =
    timePickerTarget === "close"
      ? normalizeHHMM(values.autoHoursClose) ?? "22:00"
      : timePickerTarget === "breakOpen"
        ? normalizeHHMM(values.breakHoursStart) ?? "14:00"
        : timePickerTarget === "breakClose"
          ? normalizeHHMM(values.breakHoursEnd) ?? "15:00"
          : normalizeHHMM(values.autoHoursOpen) ?? "09:00";

  const timePickerTitle =
    timePickerTarget === "close"
      ? t("business_phase7_550")
      : timePickerTarget === "open"
        ? t("business_phase7_551")
        : timePickerTarget === "breakOpen"
          ? t("business_phase7_552")
          : timePickerTarget === "breakClose"
            ? t("business_phase7_553")
            : t("business_phase7_554");

  const breakStartLabel = (() => {
    const n = normalizeHHMM(values.breakHoursStart.trim());
    return n ? formatHHmm12hLabel(n) : t("common_none");
  })();
  const breakEndLabel = (() => {
    const n = normalizeHHMM(values.breakHoursEnd.trim());
    return n ? formatHHmm12hLabel(n) : t("common_none");
  })();

  const timezoneOptions = useMemo(
    () =>
      STORE_AUTO_TIMEZONE_OPTIONS.map((o) => ({
        value: o.value,
        label: ownerStoreTimezoneLabel(language, o.value),
      })),
    [language],
  );

  return (
    <>
      <form
        id="owner-store-profile-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!isDirty) return;
          void saveStoreProfile();
        }}
        className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}
        style={formPadStyle}
      >
      <OwnerStoreAdminDashSection surfaceTone="bizSoft" title={t("business_phase7_159")}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sam-text-body text-[var(--biz-text)]">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              id="svc-delivery"
              type="checkbox"
              checked={values.deliveryAvailable}
              onChange={(e) => setValues((v) => ({ ...v, deliveryAvailable: e.target.checked }))}
              className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
            />
            <span>{t("business_phase7_106")}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              id="svc-pickup"
              type="checkbox"
              checked={values.pickupAvailable}
              onChange={(e) => setValues((v) => ({ ...v, pickupAvailable: e.target.checked }))}
              className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
            />
            <span>{t("business_phase7_315")}</span>
          </label>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection surfaceTone="bizSoft" title={t("business_phase7_176")}>
        <p className="sam-text-helper text-[var(--biz-text-muted)]">
          {t("business_phase7_546")}
          <span className="font-medium text-[var(--biz-text)]">{t("business_phase7_072")}</span>
          {t("business_phase7_547")}
          {t("business_phase7_548")}
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection surfaceTone="bizSoft" title={t("business_phase7_086")}>
        <div className={OWNER_STORE_PROFILE_BIZ_INNER_PANEL_CLASS}>
          <label className={`${OWNER_STORE_PROFILE_CHECKBOX_ROW_CLASS} items-start`}>
            <input
              type="checkbox"
              checked={values.autoBusinessHoursEnabled}
              onChange={(e) =>
                setValues((v) => ({ ...v, autoBusinessHoursEnabled: e.target.checked }))
              }
              className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[var(--biz-text)]">
                {t("business_phase7_auto_hours_schedule_enabled")}
              </span>
              <span className="mt-0.5 block sam-text-helper text-[var(--biz-text-muted)]">
                {t("business_phase7_auto_hours_schedule_hint")}
              </span>
            </span>
          </label>

          <div>
            <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_328")}</label>
            <select
              value={values.autoHoursTz}
              onChange={(e) => setValues((v) => ({ ...v, autoHoursTz: e.target.value }))}
              className={OWNER_STORE_PROFILE_SELECT_CLASS}
            >
              {timezoneOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">
              {t("business_phase7_549")}
            </p>
            <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
              <div className="min-w-0">
                <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_173")}</span>
                <button
                  type="button"
                  onClick={() => setTimePickerTarget("open")}
                  className={OWNER_STORE_PROFILE_TIME_BUTTON_CLASS}
                >
                  {formatHHmm12hLabel(values.autoHoursOpen)}
                </button>
              </div>
              <div className="min-w-0">
                <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_257")}</span>
                <button
                  type="button"
                  onClick={() => setTimePickerTarget("close")}
                  className={OWNER_STORE_PROFILE_TIME_BUTTON_CLASS}
                >
                  {formatHHmm12hLabel(values.autoHoursClose)}
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--biz-card-border)] pt-4">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={values.breakHoursEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setValues((v) => ({
                    ...v,
                    breakHoursEnabled: on,
                    ...(on && !normalizeHHMM(v.breakHoursStart.trim()) && !normalizeHHMM(v.breakHoursEnd.trim())
                      ? { breakHoursStart: "14:00", breakHoursEnd: "15:00" }
                      : {}),
                    ...(!on ? { breakHoursStart: "", breakHoursEnd: "" } : {}),
                  }));
                }}
                className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
              />
              <span>
                <span className="text-[13px] font-semibold text-[var(--biz-text)]">{t("business_phase7_172")}</span>
              </span>
            </label>
            {values.breakHoursEnabled ?
              <div className={`mt-3 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
                <div className="min-w-0">
                  <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_173")}</span>
                  <button
                    type="button"
                    onClick={() => setTimePickerTarget("breakOpen")}
                    className={OWNER_STORE_PROFILE_TIME_BUTTON_CLASS}
                  >
                    {breakStartLabel}
                  </button>
                </div>
                <div className="min-w-0">
                  <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_257")}</span>
                  <button
                    type="button"
                    onClick={() => setTimePickerTarget("breakClose")}
                    className={OWNER_STORE_PROFILE_TIME_BUTTON_CLASS}
                  >
                    {breakEndLabel}
                  </button>
                </div>
              </div>
            : null}
          </div>

          <div className="flex items-start gap-2 rounded-[16px] border border-[var(--biz-primary)]/25 bg-[var(--biz-primary-soft)] px-4 py-3">
            <input
              id="temp-closed"
              type="checkbox"
              checked={!values.isOpen}
              onChange={(e) => setValues((v) => ({ ...v, isOpen: !e.target.checked }))}
              className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
            />
            <label htmlFor="temp-closed" className="sam-text-body-secondary leading-snug text-[var(--biz-text)]">
              <span className="font-medium">{t("business_phase7_239")}</span>
            </label>
          </div>

          <div>
            <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_185")}</label>
            <input
              type="text"
              value={values.hoursNote}
              onChange={(e) => setValues((v) => ({ ...v, hoursNote: e.target.value }))}
              placeholder={t("business_phase7_208")}
              className={OWNER_STORE_PROFILE_CONTROL_CLASS}
            />
          </div>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection surfaceTone="bizSoft" title={t("business_phase7_027")}>
        <label htmlFor={`menu-sold-out-bottom-${storeId}`} className={OWNER_STORE_PROFILE_CHECKBOX_ROW_CLASS}>
          <input
            id={`menu-sold-out-bottom-${storeId}`}
            type="checkbox"
            checked={values.menuSoldOutBottom}
            onChange={(e) => setValues((v) => ({ ...v, menuSoldOutBottom: e.target.checked }))}
            className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
          />
          <span className="min-w-0 leading-snug">
            <span className="block text-[13px] font-semibold text-[var(--biz-text)]">
              {t("business_phase7_539")}
            </span>
            <span className="mt-0.5 block sam-text-helper text-[var(--biz-text-muted)]">
              {t("business_phase7_538")}
            </span>
          </span>
        </label>
        <label className={`${OWNER_STORE_PROFILE_CHECKBOX_ROW_CLASS} mt-3`}>
          <input
            type="checkbox"
            checked={publicCommerceDetailOpen}
            onChange={(e) => setPublicCommerceDetailOpen(e.target.checked)}
            className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-[var(--biz-text)]">{t("business_phase7_140")}</span>
          </span>
        </label>
        {publicCommerceDetailOpen ? (
          <div className="mt-4 space-y-4 border-t border-[var(--biz-card-border)] pt-4">
            <div>
              <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_011")}</span>
              <div className="rounded-[16px] border border-[var(--biz-primary)]/20 bg-[var(--biz-primary-soft)] px-4 py-3 sam-text-body text-[var(--biz-text)]">
                <div className="flex flex-nowrap items-center gap-x-3 gap-y-0 overflow-x-auto py-0.5 [scrollbar-width:thin] sm:gap-x-5">
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodGcash}
                      onChange={(e) => setValues((v) => ({ ...v, payMethodGcash: e.target.checked }))}
                      className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
                    />
                    <span>GCash</span>
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodCashMeet}
                      onChange={(e) => setValues((v) => ({ ...v, payMethodCashMeet: e.target.checked }))}
                      className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
                    />
                    <span>{t("business_phase7_067")}</span>
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodBank}
                      onChange={(e) => setValues((v) => ({ ...v, payMethodBank: e.target.checked }))}
                      className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
                    />
                    <span>{t("business_phase7_015")}</span>
                  </label>
                  <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--biz-card-border)]" aria-hidden />
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodOtherEnabled}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, payMethodOtherEnabled: e.target.checked }))
                      }
                      className={OWNER_STORE_PROFILE_CHECKBOX_CLASS}
                    />
                    <span>{t("business_phase7_040")}</span>
                  </label>
                  <input
                    type="text"
                    value={values.payMethodOtherText}
                    onChange={(e) => setValues((v) => ({ ...v, payMethodOtherText: e.target.value }))}
                    disabled={!values.payMethodOtherEnabled}
                    placeholder={t("business_phase7_042")}
                    className={`sam-input min-w-[8rem] max-w-[14rem] flex-1 sam-text-body-secondary text-[var(--biz-text)] disabled:bg-[var(--biz-tan-soft)] disabled:text-[var(--biz-text-muted)] sm:min-w-[12rem] sm:max-w-none sm:flex-[1_1_12rem] ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
                <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>{t("business_phase7_292")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.minOrderPhp}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, minOrderPhp: formatPriceInput(e.target.value) }))
                  }
                  placeholder={t("business_phase7_003")}
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                />
              </div>
            </div>
            <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
              <span className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>{t("business_phase7_109")}</span>
              <p className="mb-2 sam-text-xxs text-[var(--biz-text-muted)]">
                {t("business_phase7_566")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name={`delivery-fee-mode-${storeId}`}
                    checked={values.deliveryFeeMode === "self"}
                    onChange={() =>
                      setValues((v) => ({
                        ...v,
                        deliveryFeeMode: "self",
                      }))
                    }
                    className={`${OWNER_STORE_PROFILE_CHECKBOX_CLASS} border-0`}
                  />
                  <span>{t("business_phase7_240")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name={`delivery-fee-mode-${storeId}`}
                    checked={values.deliveryFeeMode === "self_free_promo"}
                    onChange={() =>
                      setValues((v) => ({
                        ...v,
                        deliveryFeeMode: "self_free_promo",
                      }))
                    }
                    className={`${OWNER_STORE_PROFILE_CHECKBOX_CLASS} border-0`}
                  />
                  <span>{t("business_phase7_116")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name={`delivery-fee-mode-${storeId}`}
                    checked={values.deliveryFeeMode === "courier"}
                    onChange={() =>
                      setValues((v) => ({
                        ...v,
                        deliveryFeeMode: "courier",
                      }))
                    }
                    className={`${OWNER_STORE_PROFILE_CHECKBOX_CLASS} border-0`}
                  />
                  <span>{t("business_phase7_112")}</span>
                </label>
              </div>
            </div>
            {values.deliveryFeeMode === "self" ? (
              <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
                <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>
                  {t("business_phase7_567")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.deliveryFeePhp}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, deliveryFeePhp: formatPriceInput(e.target.value) }))
                  }
                  placeholder={t("business_phase7_133")}
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                />
              </div>
            ) : null}
            {values.deliveryFeeMode === "self_free_promo" ? (
              <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
                <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>
                  {t("business_phase7_568")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.deliveryFeeStrikeReferencePhp}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      deliveryFeeStrikeReferencePhp: formatPriceInput(e.target.value),
                    }))
                  }
                  placeholder={t("business_phase7_004")}
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                />
              </div>
            ) : null}
            {values.deliveryFeeMode === "courier" ? (
              <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
                <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>
                  {t("business_phase7_569")}
                </label>
                <input
                  type="text"
                  value={values.deliveryCourierLabel}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, deliveryCourierLabel: e.target.value }))
                  }
                  placeholder={t("business_phase7_205")}
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                />
              </div>
            ) : null}
            {values.deliveryFeeMode === "self" ? (
              <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
                <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>
                  {t("business_phase7_570")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.freeDeliveryOverPhp}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      freeDeliveryOverPhp: formatPriceInput(e.target.value),
                    }))
                  }
                  placeholder={t("business_phase7_202")}
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                />
              </div>
            ) : null}
            <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
              <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>
                {t("business_phase7_555")}
              </label>
              <p className="mb-2 sam-text-xxs text-[var(--biz-text-muted)]">
                {t("business_phase7_556")}
                <Link
                  href={`/stores/owner/notices?storeId=${encodeURIComponent(storeId)}`}
                  className="font-semibold text-[var(--biz-primary)] underline underline-offset-2"
                >
                  {t("business_phase7_030")}
                </Link>
                {t("business_phase7_557")}
              </p>
              {values.publicNotices.length === 0 ? (
                <p className="mb-2 sam-text-helper text-[var(--biz-text-muted)]">{t("business_phase7_056")}</p>
              ) : (
                <ul className="mb-2 space-y-2">
                  {values.publicNotices.map((line, i) => (
                    <li key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
                      <textarea
                        value={line}
                        onChange={(e) =>
                          setValues((v) => {
                            const next = [...v.publicNotices];
                            next[i] = e.target.value;
                            return { ...v, publicNotices: next };
                          })
                        }
                        rows={2}
                        placeholder={t("business_phase7_558", { v1: i + 1 })}
                        className={`min-w-0 flex-1 ${OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setValues((v) => ({
                            ...v,
                            publicNotices: v.publicNotices.filter((_, j) => j !== i),
                          }))
                        }
                        className="shrink-0 rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-2.5 py-2 sam-text-helper font-medium text-[var(--biz-text)] active:bg-[var(--biz-primary-soft)]"
                      >
                        {t("common_delete")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setValues((v) => ({ ...v, publicNotices: [...v.publicNotices, ""] }))}
                className="rounded-ui-rect border border-dashed border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 sam-text-body-secondary font-medium text-[var(--biz-text)] active:bg-[var(--biz-primary-soft)]"
              >
                {t("business_phase7_559")}
              </button>
            </div>
            <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
              <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>{t("business_phase7_118")}</label>
              <textarea
                value={values.deliveryNotice}
                onChange={(e) => setValues((v) => ({ ...v, deliveryNotice: e.target.value }))}
                rows={4}
                placeholder={t("business_phase7_284")}
                className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              />
            </div>
            <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
              <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>{t("business_phase7_211")}</label>
              <input
                type="number"
                min={1}
                max={180}
                inputMode="numeric"
                value={values.prepTimeMinutes}
                onChange={(e) => setValues((v) => ({ ...v, prepTimeMinutes: e.target.value }))}
                placeholder={t("business_phase7_203")}
                className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              />
              <p className="mt-1.5 sam-text-helper text-[var(--biz-text-muted)]">
                {globalRideTimeSource === "google" ? (
                  <>
                    {t("business_phase7_561")}
                    <strong className="text-[var(--biz-text)]">{t("business_phase7_035")}</strong>
                    {t("business_phase7_562")}
                  </>
                ) : globalRideTimeSource === "store" ? (
                  <>
                    {t("business_phase7_563")}
                    <strong className="text-[var(--biz-text)]">{t("business_phase7_166")}</strong>
                    {t("business_phase7_564")}
                  </>
                ) : (
                  t("business_phase7_560")
                )}
              </p>
            </div>
            {globalRideTimeSource === "store" ? (
              <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
                <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>{t("business_phase7_110")}</label>
                <input
                  type="text"
                  maxLength={80}
                  value={values.deliveryRideDisplayManual}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, deliveryRideDisplayManual: e.target.value.slice(0, 80) }))
                  }
                  placeholder={t("business_phase7_204")}
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                />
                <p className="mt-1.5 sam-text-helper text-[var(--biz-text-muted)]">
                  {t("business_phase7_565")}
                </p>
              </div>
            ) : null}
            <div className={OWNER_STORE_PROFILE_FIELD_SHELL_CLASS}>
              <label className={OWNER_STORE_PROFILE_SUBBLOCK_HEAD_CLASS}>{t("business_phase7_314")}</label>
              <input
                type="text"
                value={values.avgChatResponse}
                onChange={(e) => setValues((v) => ({ ...v, avgChatResponse: e.target.value }))}
                placeholder={t("business_phase7_201")}
                className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              />
            </div>
          </div>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection surfaceTone="bizSoft" title={t("business_phase7_007")}>
        <p className="sam-text-helper text-[var(--biz-text-muted)]">
          {t("business_phase7_571", { v1: GALLERY_MAX })}
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-[44px] min-w-0 cursor-pointer items-center rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 sam-text-body-secondary font-medium text-[var(--biz-text)] disabled:cursor-not-allowed disabled:opacity-50">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={!!uploading || values.galleryUrls.filter((u) => u.trim()).length >= GALLERY_MAX}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadGalleryImage(f);
              }}
            />
            {uploading === "gallery" ? t("business_phase7_188") : t("business_phase7_572")}
          </label>
          <span className="flex min-w-0 items-center sam-text-helper text-[var(--biz-text-muted)]">
            {t("business_phase7_573", { v1: values.galleryUrls.filter((u) => u.trim()).length, v2: GALLERY_MAX })}
          </span>
        </div>
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {values.galleryUrls.filter((u) => u.trim()).length === 0 ? (
            <li className="col-span-full min-w-0 break-words sam-text-body-secondary leading-snug text-[var(--biz-text-muted)]">
              {t("business_phase7_574")}
            </li>
          ) : (
            values.galleryUrls.map((url, i) => {
              const u = url.trim();
              if (!u) return null;
              return (
                <li
                  key={`${i}-${u.slice(0, 48)}`}
                  className="relative aspect-square min-w-0 overflow-hidden rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)]"
                >
                  <img
                    src={u}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setValues((v) => ({
                        ...v,
                        galleryUrls: v.galleryUrls.filter((_, j) => j !== i),
                      }))
                    }
                    className="absolute right-1 top-1 rounded-ui-rect bg-black/55 px-2 py-1 sam-text-xxs font-semibold text-white backdrop-blur-sm"
                  >
                    {t("common_delete")}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </OwnerStoreAdminDashSection>
    </form>

      <BodyPortal>
        <footer
          role="contentinfo"
          aria-label={t("business_phase7_070")}
          data-form-keyboard-footer="1"
          data-form-keyboard-open={keyboardOpen ? "true" : "false"}
          className={footerFixedClassName}
          style={footerPadStyle}
        >
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            {error ?
              <div
                className="max-h-20 overflow-y-auto border-b border-red-100 bg-red-50 px-3 py-1.5 sam-text-xxs leading-snug text-red-800"
                role="alert"
              >
                {error}
              </div>
            : null}
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              <button
                type="button"
                onClick={revertToSaved}
                disabled={!isDirty || submitting || !!uploading || leaveSaving || saveConfirmOpen}
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
              >
                {t("common_cancel")}
              </button>
              <button
                type="submit"
                form="owner-store-profile-form"
                disabled={!isDirty || submitting || !!uploading || leaveSaving || saveConfirmOpen}
                className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
              >
                {submitting ? t("business_phase7_384") : t("common_save")}
              </button>
            </div>
          </div>
        </footer>
      </BodyPortal>

      <OwnerStoreAdminConfirmModal
        open={saveConfirmOpen}
        titleId="owner-store-profile-save-confirm-title"
        title={t("business_phase7_070")}
        description={saveConfirmDescription}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("common_save")}
        confirmBusyLabel={t("business_phase7_384")}
        busy={submitting}
        disableActions={submitting || !!uploading || leaveSaving}
        confirmTone="primary"
        onCancel={() => setSaveConfirmOpen(false)}
        onConfirm={async () => {
          setSaveConfirmOpen(false);
          await runSave({ skipPrompt: true });
        }}
      />

      <OwnerStoreAdminLeavePromptModal
        open={leavePrompt != null}
        titleId="owner-store-profile-leave-title"
        leaveSaving={leaveSaving}
        disableActions={leaveSaving || submitting || !!uploading}
        onDiscard={confirmLeaveDiscard}
        onConfirmSave={confirmLeaveWithSave}
      />

      <TumblerTimePickerDialog
        open={timePickerTarget !== null}
        title={timePickerTitle}
        valueHHmm={timePickerValue}
        onClose={() => setTimePickerTarget(null)}
        onConfirm={(hhmm24) => {
          const n = normalizeHHMM(hhmm24) ?? hhmm24;
          if (timePickerTarget === "close") {
            setValues((v) => ({ ...v, autoHoursClose: n }));
          } else if (timePickerTarget === "open") {
            setValues((v) => ({ ...v, autoHoursOpen: n }));
          } else if (timePickerTarget === "breakOpen") {
            setValues((v) => ({ ...v, breakHoursStart: n }));
          } else if (timePickerTarget === "breakClose") {
            setValues((v) => ({ ...v, breakHoursEnd: n }));
          }
        }}
      />
    </>
  );
}

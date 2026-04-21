"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  OWNER_STORE_CONTROL_COMPACT_BLOCK_CLASS,
  OWNER_STORE_CONTROL_COMPACT_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
  OWNER_STORE_TIME_BLOCK_BUTTON_CLASS,
} from "@/lib/business/owner-store-stack";
import { usePathname } from "next/navigation";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { readPublicNoticesFromBusinessRecord } from "@/lib/stores/store-detail-meta";
import {
  formatPaymentMethodsDisplayLine,
  paymentMethodsConfigPayload,
  readPaymentMethodsFormValues,
} from "@/lib/stores/payment-methods-config";
import {
  normalizeHHMM,
  readAutoHoursFormFields,
  readBreakHoursFormFields,
  STORE_AUTO_TIMEZONE_OPTIONS,
} from "@/lib/stores/store-auto-hours";
import { TumblerTimePickerDialog } from "@/components/ui/TumblerTimePickerDialog";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { formatHHmm12hLabel } from "@/lib/utils/tumbler-time";
const GALLERY_MAX = 16;

function intStrFromJson(o: Record<string, unknown>, snake: string, camel: string): string {
  const v = o[snake] ?? o[camel];
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n));
}

function readPublicCommerceFields(raw: unknown) {
  const o = coerceBusinessHoursRecord(raw);
  const hoursNote = typeof o.note === "string" ? o.note : "";
  const s = (a: string, b: string) =>
    String(o[a] ?? o[b] ?? "")
      .trim()
      .replace(/\r\n/g, "\n");
  return {
    hoursNote,
    publicNotices: readPublicNoticesFromBusinessRecord(raw),
    freeDeliveryOverPhp: intStrFromJson(o, "free_delivery_over_php", "freeDeliveryOverPhp"),
    deliveryNotice: s("delivery_notice", "deliveryNotice"),
    avgDeliveryTime: s("avg_delivery_time", "avgDeliveryTime"),
    avgChatResponse: s("avg_chat_response", "avgChatResponse"),
    minOrderPhp: intStrFromJson(o, "min_order_php", "minOrderPhp"),
    deliveryFeePhp: intStrFromJson(o, "delivery_fee_php", "deliveryFeePhp"),
    deliveryCourierLabel: s("delivery_courier_label", "deliveryCourierLabel"),
    estPrepLabel: s("est_prep_label", "estPrepLabel"),
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
  pickupAvailable: boolean;
  hoursNote: string;
  /** 매장 창 영업시간 — business_hours_json.auto_business_hours */
  autoHoursTz: string;
  autoHoursOpen: string;
  autoHoursClose: string;
  /** 공개 상세·가게정보 배달/결제 JSON 확장 */
  payMethodGcash: boolean;
  payMethodCashMeet: boolean;
  payMethodBank: boolean;
  payMethodOtherEnabled: boolean;
  payMethodOtherText: string;
  /** 매장 창 공지 — 위에서 아래 순 */
  publicNotices: string[];
  freeDeliveryOverPhp: string;
  deliveryNotice: string;
  avgDeliveryTime: string;
  /** 쉬는 시간 — 체크 시에만 시간 UI·저장 */
  breakHoursEnabled: boolean;
  breakHoursStart: string;
  breakHoursEnd: string;
  avgChatResponse: string;
  minOrderPhp: string;
  deliveryFeePhp: string;
  /** 배달 업체·수단 안내(청구 금액 미포함) */
  deliveryCourierLabel: string;
  estPrepLabel: string;
  latStr: string;
  lngStr: string;
  galleryUrls: string[];
};

/** 사장님이 배달·결제·안내 필드를 한 번이라도 넣었으면 편집 패널을 자동으로 연다 */
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
  if (v.deliveryCourierLabel.trim()) return true;
  if (v.freeDeliveryOverPhp.trim()) return true;
  if (v.publicNotices.some((t) => t.trim())) return true;
  if (v.deliveryNotice.trim()) return true;
  if (v.avgDeliveryTime.trim()) return true;
  if (v.avgChatResponse.trim()) return true;
  if (v.estPrepLabel.trim()) return true;
  return false;
}

function rowToFormValues(row: StoreRow): OwnerStoreProfileFormValues {
  const { intro, kakao } = splitStoreDescriptionAndKakao(row.description, row.kakao_id ?? null);
  const a1 = (row.address_line1 ?? "").trim();
  const d = (row.district ?? "").trim();
  const street = a1 || d;
  const detail = (row.address_line2 ?? "").trim();
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
    pickupAvailable: row.pickup_available !== false,
    ...readAutoHoursFormFields(row.business_hours_json),
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

/** 매장 관리 저장분 = 매장 창 표시와 동일 JSON (`public_notices` 등). */
function buildBusinessHoursJson(
  row: StoreRow,
  values: OwnerStoreProfileFormValues
): Record<string, unknown> {
  const prev = { ...coerceBusinessHoursRecord(row.business_hours_json) };
  const drop = [
    "weekdays",
    "weekdays_hours",
    "note",
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
    "delivery_courier_label",
    "deliveryCourierLabel",
    "est_prep_label",
    "estPrepLabel",
    "auto_business_hours",
    "autoBusinessHours",
  ] as const;
  for (const k of drop) delete prev[k];

  const n = values.hoursNote.trim();
  if (n) prev.note = n;

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
  const fo = values.freeDeliveryOverPhp.trim();
  if (fo) {
    const x = Math.round(Number(fo));
    if (Number.isFinite(x) && x > 0) prev.free_delivery_over_php = x;
  }
  const dn = values.deliveryNotice.trim();
  if (dn) prev.delivery_notice = dn;
  const ad = values.avgDeliveryTime.trim();
  if (ad) prev.avg_delivery_time = ad;
  if (values.breakHoursEnabled) {
    const bs = normalizeHHMM(values.breakHoursStart.trim());
    const be = normalizeHHMM(values.breakHoursEnd.trim());
    if (bs && be && bs !== be) {
      prev.break_hours = { start: bs, end: be };
      prev.break_time = `${bs}–${be}`;
    }
  }
  const ch = values.avgChatResponse.trim();
  if (ch) prev.avg_chat_response = ch;
  const mo = values.minOrderPhp.trim();
  if (mo) {
    const x = Math.round(Number(mo));
    if (Number.isFinite(x) && x >= 0) prev.min_order_php = x;
  }
  const df = values.deliveryFeePhp.trim();
  if (df) {
    const x = Math.round(Number(df));
    if (Number.isFinite(x) && x >= 0) prev.delivery_fee_php = x;
  }
  const dc = values.deliveryCourierLabel.trim();
  if (dc) prev.delivery_courier_label = dc;
  const est = values.estPrepLabel.trim();
  if (est) prev.est_prep_label = est;

  const tz = (values.autoHoursTz || "Asia/Manila").trim() || "Asia/Manila";
  const o = normalizeHHMM(values.autoHoursOpen.trim());
  const c = normalizeHHMM(values.autoHoursClose.trim());
  if (o && c && o !== c) {
    prev.auto_business_hours = { enabled: true, timezone: tz, open: o, close: c };
    prev.weekdays = `매일 ${o}–${c} (${tz})`;
  } else {
    prev.auto_business_hours = { enabled: false };
  }

  return prev;
}


interface OwnerStoreProfileFormProps {
  storeId: string;
  storeSlug: string;
  row: StoreRow;
  onSaved: () => void;
  onCancel: () => void;
  /** 폼에서 배달·픽업 토글 시 하단 요약(저장 전)과 맞추기 */
  onServiceDraftChange?: (d: { deliveryAvailable: boolean; pickupAvailable: boolean }) => void;
}

function patchErrorToUserMessage(code: string): string | null {
  const m: Record<string, string> = {
    no_fields: "변경할 내용이 없습니다. 잠시 후 다시 시도해 주세요.",
    store_not_editable: "현재 상태에서는 매장 정보를 수정할 수 없습니다.",
    store_load_failed: "매장 정보를 불러오지 못해 저장할 수 없습니다. 새로고침 후 다시 시도해 주세요.",
    invalid_store_category_id: "업종(1차 분류) 값이 올바르지 않습니다. 새로고침 후 다시 선택해 주세요.",
    invalid_store_topic_id: "세부 주제 값이 올바르지 않습니다. 다시 선택해 주세요.",
    store_topic_not_found: "선택한 세부 주제를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.",
    store_topic_category_mismatch: "세부 주제가 선택한 업종과 맞지 않습니다. 업종·주제를 다시 맞춰 주세요.",
    invalid_business_hours_json: "영업·배달 안내(JSON) 형식이 올바르지 않습니다.",
    invalid_gallery_images_json: "갤러리 이미지 목록 형식이 올바르지 않습니다.",
    invalid_lat: "위도(-90~90) 형식을 확인해 주세요.",
    invalid_lng: "경도(-180~180) 형식을 확인해 주세요.",
    supabase_unconfigured: "서버 저장소 설정을 확인해 주세요.",
    unauthorized: "로그인이 필요합니다.",
    forbidden: "이 매장을 수정할 권한이 없습니다.",
    store_not_found: "매장을 찾을 수 없습니다.",
    update_no_row: "저장이 반영되지 않았습니다. 새로고침 후 다시 시도해 주세요.",
  };
  return m[code] ?? null;
}

export function OwnerStoreProfileForm({
  storeId,
  storeSlug,
  row,
  onSaved,
  onCancel,
  onServiceDraftChange,
}: OwnerStoreProfileFormProps) {
  const pathname = usePathname();
  const hideAppBottomNav =
    (pathname?.startsWith("/my/settings") ?? false) ||
    pathname === "/my/logout" ||
    isProfileEditPath(pathname);
  const dockAboveBottomNav =
    !hideAppBottomNav && (pathname?.startsWith("/my") ?? false);

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

  useEffect(() => {
    const next = rowToFormValues(row);
    setValues(next);
    setPublicCommerceDetailOpen(hasPersistedPublicCommerceDetail(next));
  }, [row]);

  useEffect(() => {
    onServiceDraftChange?.({
      deliveryAvailable: values.deliveryAvailable,
      pickupAvailable: values.pickupAvailable,
    });
  }, [values.deliveryAvailable, values.pickupAvailable, onServiceDraftChange]);

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
        const msg =
          typeof j?.message === "string" && j.message.trim()
            ? j.message
            : j?.error === "storage_bucket_missing"
              ? "Storage 버킷 store-product-images가 없습니다. Supabase SQL(매장 이미지 버킷)을 실행하거나 마이그레이션을 적용해 주세요."
              : typeof j?.error === "string"
                ? j.error
                : "이미지 업로드에 실패했습니다.";
        setError(msg);
        return;
      }
      setValues((v) => {
        const filled = v.galleryUrls.map((x) => x.trim()).filter(Boolean);
        const next = [...filled, String(j.url).trim()].filter(Boolean).slice(0, GALLERY_MAX);
        return { ...v, galleryUrls: next };
      });
    } catch {
      setError("이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(null);
    }
  };

  const saveStoreProfile = async () => {
    try {
      setError(null);
      const business_hours_json = buildBusinessHoursJson(row, values);
      const gallery_images_json = values.galleryUrls.map((u) => u.trim()).filter(Boolean);
      if (gallery_images_json.length > GALLERY_MAX) {
        setError(`갤러리 이미지는 최대 ${GALLERY_MAX}장까지입니다.`);
        return;
      }
      {
        const o = normalizeHHMM(values.autoHoursOpen.trim());
        const c = normalizeHHMM(values.autoHoursClose.trim());
        if (!o || !c || o === c) {
          setError("매장 창 영업시간: 시작·종료를 HH:mm(예: 09:00, 22:00)로 입력해 주세요.");
          return;
        }
      }
      if (values.breakHoursEnabled) {
        const bs = normalizeHHMM(values.breakHoursStart.trim());
        const be = normalizeHHMM(values.breakHoursEnd.trim());
        if (!bs || !be || bs === be) {
          setError("쉬는 시간: 시작·종료를 모두 선택해 주세요.");
          return;
        }
      }
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "이 화면의 매장 설정(영업시간·휴무·배달 안내·갤러리·서비스 형태 등)만 저장합니다. 계속할까요?"
        )
      ) {
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            /** 매장명·업종은 승인 시 고정. 로고·소개·연락처·주소 등은 기본 정보 화면에서만 PATCH */
            is_open: values.isOpen,
            delivery_available: values.deliveryAvailable,
            pickup_available: values.pickupAvailable,
            business_hours_json,
            gallery_images_json,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError("로그인이 필요합니다.");
          return;
        }
        if (!j?.ok || !j?.store) {
          const code = typeof j?.error === "string" ? j.error : "";
          const mapped = patchErrorToUserMessage(code);
          setError(
            j?.ok && !j?.store
              ? "저장 응답이 올바르지 않습니다. 목록을 새로고침해 변경 여부를 확인해 주세요."
              : mapped ?? (code ? code : "저장에 실패했습니다.")
          );
          return;
        }
        onSaved();
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setSubmitting(false);
      }
    } catch (err) {
      console.error("[OwnerStoreProfileForm] saveStoreProfile", err);
      setError("저장 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setSubmitting(false);
    }
  };

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
      ? "영업 종료"
      : timePickerTarget === "open"
        ? "영업 시작"
        : timePickerTarget === "breakOpen"
          ? "쉬는 시간 시작"
          : timePickerTarget === "breakClose"
            ? "쉬는 시간 종료"
            : "시간 설정";

  const breakStartLabel = (() => {
    const n = normalizeHHMM(values.breakHoursStart.trim());
    return n ? formatHHmm12hLabel(n) : "없음";
  })();
  const breakEndLabel = (() => {
    const n = normalizeHHMM(values.breakHoursEnd.trim());
    return n ? formatHHmm12hLabel(n) : "없음";
  })();

  const actionBarInner = (
    <>
      {error ? (
        <div
          className="mb-2 max-h-24 overflow-y-auto rounded-ui-rect border border-red-100 bg-red-50 px-3 py-2 sam-text-helper leading-snug text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-row gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body font-medium text-sam-fg shadow-sm"
        >
          취소
        </button>
        <button
          type="submit"
          form="owner-store-profile-form"
          disabled={submitting}
          className="min-h-[48px] min-w-0 flex-1 rounded-ui-rect bg-signature px-3 py-3 sam-text-body font-medium text-white shadow-sm disabled:opacity-50"
        >
          {submitting ? "저장 중…" : "저장"}
        </button>
      </div>
    </>
  );

  return (
    <>
    <form
      id="owner-store-profile-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void saveStoreProfile();
      }}
      className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS} pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))]`}
    >
      <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-2.5 sam-text-helper leading-relaxed text-sam-muted">
        로고·매장명·연락처·위치·상세 주소·업종·세부 주제는{" "}
        <Link
          href={`/my/business/basic-info?storeId=${encodeURIComponent(storeId)}`}
          className="font-medium text-signature underline"
        >
          기본 정보
        </Link>
        에서 수정합니다.
      </p>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3">
        <h3 className="sam-text-body font-semibold text-sam-fg">서비스 형태</h3>
        <p className="mt-1 sam-text-helper text-sam-muted">
          매장 상세 화면 상단의 배달·포장·픽업 안내 뱃지와 동일하게 반영됩니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 sam-text-body text-sam-fg">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              id="svc-delivery"
              type="checkbox"
              checked={values.deliveryAvailable}
              onChange={(e) => setValues((v) => ({ ...v, deliveryAvailable: e.target.checked }))}
              className="h-4 w-4 rounded border-sam-border text-signature"
            />
            <span>배달 가능</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              id="svc-pickup"
              type="checkbox"
              checked={values.pickupAvailable}
              onChange={(e) => setValues((v) => ({ ...v, pickupAvailable: e.target.checked }))}
              className="h-4 w-4 rounded border-sam-border text-signature"
            />
            <span>포장·픽업 가능</span>
          </label>
        </div>
      </div>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app/80 px-3 py-3">
        <h3 className="sam-text-body font-semibold text-sam-fg">신규 주문 알림음 (배달)</h3>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
          모든 매장에 동일하게 적용됩니다. 소리 파일은 관리자{" "}
          <span className="font-medium text-sam-fg">매장 신청 설정</span>(<code className="rounded bg-sam-surface px-1 sam-text-xxs">/admin/stores/application-settings</code>
          )의「매장 알림음 (배달 신규 주문)」에서 설정합니다. 미설정 시 짧은 비프음이 재생됩니다.
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3">
        <h3 className="sam-text-body font-semibold text-sam-fg">매장 창 영업시간 (현지 시각)</h3>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
          매장 목록·상세·가게정보에 &quot;매일 시작–종료 (타임존)&quot; 안내가 올라가고, 현지 시각이 그
          구간 안이면 영업중·밖이면 준비중으로 바뀝니다.
        </p>
        <div className="mt-3 space-y-3 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 px-3 py-3">
          <div>
            <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">현지 타임존</label>
            <select
              value={values.autoHoursTz}
              onChange={(e) => setValues((v) => ({ ...v, autoHoursTz: e.target.value }))}
              className={OWNER_STORE_SELECT_CLASS}
            >
              {STORE_AUTO_TIMEZONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
            <div className="min-w-0">
              <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">시작</span>
              <button
                type="button"
                onClick={() => setTimePickerTarget("open")}
                className={OWNER_STORE_TIME_BLOCK_BUTTON_CLASS}
              >
                {formatHHmm12hLabel(values.autoHoursOpen)}
              </button>
            </div>
            <div className="min-w-0">
              <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">종료</span>
              <button
                type="button"
                onClick={() => setTimePickerTarget("close")}
                className={OWNER_STORE_TIME_BLOCK_BUTTON_CLASS}
              >
                {formatHHmm12hLabel(values.autoHoursClose)}
              </button>
            </div>
          </div>
          <p className="sam-text-xxs leading-relaxed text-sam-muted">
            종료가 시작보다 이르면(예: 22:00–06:00) 밤부터 다음 날 아침까지 한 번에 영업으로 봅니다.
          </p>
          <div className="mt-4 border-t border-sam-border/90 pt-4">
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
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-sam-border text-signature"
              />
              <span>
                <span className="sam-text-body-secondary font-medium text-sam-fg">쉬는 시간 사용</span>
                <span className="mt-0.5 block sam-text-xxs font-normal leading-relaxed text-sam-muted">
                  켜면 매장 창에 Break time이 표시되고, 해당 시간대에는 메뉴를 담을 수 없습니다.
                </span>
              </span>
            </label>
            {values.breakHoursEnabled ? (
              <>
                <div className={`mt-3 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
                  <div className="min-w-0">
                    <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">시작</span>
                    <button
                      type="button"
                      onClick={() => setTimePickerTarget("breakOpen")}
                      className={OWNER_STORE_TIME_BLOCK_BUTTON_CLASS}
                    >
                      {breakStartLabel}
                    </button>
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">종료</span>
                    <button
                      type="button"
                      onClick={() => setTimePickerTarget("breakClose")}
                      className={OWNER_STORE_TIME_BLOCK_BUTTON_CLASS}
                    >
                      {breakEndLabel}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-ui-rect border border-amber-100 bg-amber-50/50 px-3 py-2.5">
          <input
            id="temp-closed"
            type="checkbox"
            checked={!values.isOpen}
            onChange={(e) => setValues((v) => ({ ...v, isOpen: !e.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-sam-border text-signature"
          />
          <label htmlFor="temp-closed" className="sam-text-body-secondary leading-snug text-sam-fg">
            <span className="font-medium">임시 휴무 (매장 창에 항상 준비중)</span>
            <span className="mt-0.5 block sam-text-helper font-normal text-sam-muted">
              켜 두면 위 영업 시간 안이어도 고객 화면에는 준비중으로만 보입니다.
            </span>
          </label>
        </div>
        <label className="mb-1 mt-3 block sam-text-body-secondary font-medium text-sam-fg">안내 메모 (선택)</label>
        <input
          type="text"
          value={values.hoursNote}
          onChange={(e) => setValues((v) => ({ ...v, hoursNote: e.target.value }))}
          placeholder="예: 연중무휴 · 일요일 휴무"
          className={OWNER_STORE_CONTROL_COMPACT_CLASS}
        />
      </div>

      <div
        className={`rounded-ui-rect border px-3 py-3 ${
          publicCommerceDetailOpen
            ? "border-amber-100 bg-amber-50/40"
            : "border-sam-border bg-sam-app/90"
        }`}
      >
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={publicCommerceDetailOpen}
            onChange={(e) => setPublicCommerceDetailOpen(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-sam-border text-signature"
          />
          <span className="min-w-0">
            <span className="sam-text-body font-semibold text-sam-fg">공개 페이지 — 배달·결제·안내</span>
            <span className="mt-0.5 block sam-text-helper font-normal leading-relaxed text-sam-muted">
              최소주문·결제수단·배달비·프로모 문구 등 고객 매장 화면에 쓰입니다. 체크하면 입력란이 열립니다.
            </span>
          </span>
        </label>
        {publicCommerceDetailOpen ? (
          <div className="mt-3 space-y-3 border-t border-amber-200/60 pt-3">
            <div>
              <span className="mb-2 block sam-text-body-secondary font-medium text-sam-fg">결제 방법 안내</span>
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg">
                <div className="flex flex-nowrap items-center gap-x-3 gap-y-0 overflow-x-auto py-0.5 [scrollbar-width:thin] sm:gap-x-5">
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodGcash}
                      onChange={(e) => setValues((v) => ({ ...v, payMethodGcash: e.target.checked }))}
                      className="h-4 w-4 shrink-0 rounded border-sam-border text-signature"
                    />
                    <span>GCash</span>
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodCashMeet}
                      onChange={(e) => setValues((v) => ({ ...v, payMethodCashMeet: e.target.checked }))}
                      className="h-4 w-4 shrink-0 rounded border-sam-border text-signature"
                    />
                    <span>만나서 현금</span>
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodBank}
                      onChange={(e) => setValues((v) => ({ ...v, payMethodBank: e.target.checked }))}
                      className="h-4 w-4 shrink-0 rounded border-sam-border text-signature"
                    />
                    <span>계좌이체</span>
                  </label>
                  <span className="mx-0.5 h-4 w-px shrink-0 bg-sam-border-soft" aria-hidden />
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={values.payMethodOtherEnabled}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, payMethodOtherEnabled: e.target.checked }))
                      }
                      className="h-4 w-4 shrink-0 rounded border-sam-border text-signature"
                    />
                    <span>기타</span>
                  </label>
                  <input
                    type="text"
                    value={values.payMethodOtherText}
                    onChange={(e) => setValues((v) => ({ ...v, payMethodOtherText: e.target.value }))}
                    disabled={!values.payMethodOtherEnabled}
                    placeholder="기타 입력"
                    className={`min-w-[8rem] max-w-[14rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 sam-text-body-secondary text-sam-fg disabled:bg-sam-app disabled:text-sam-meta sm:min-w-[12rem] sm:max-w-none sm:flex-[1_1_12rem]`}
                  />
                </div>
              </div>
              <p className="mt-1.5 sam-text-xxs leading-snug text-sam-muted">
                체크한 수단만 장바구니 주문 화면에 표시됩니다. 기타는 입력한 문구가 그대로 고객에게 보이고, 주문에도
                저장됩니다.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">최소 주문 (₱, 숫자)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.minOrderPhp}
                  onChange={(e) => setValues((v) => ({ ...v, minOrderPhp: e.target.value }))}
                  placeholder="0 이면 0₱ 표시"
                  className={OWNER_STORE_CONTROL_COMPACT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">예상 배달비 (₱, 숫자)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.deliveryFeePhp}
                  onChange={(e) => setValues((v) => ({ ...v, deliveryFeePhp: e.target.value }))}
                  placeholder="비우면 배달 시 ‘문의’로 표시"
                  className={OWNER_STORE_CONTROL_COMPACT_CLASS}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                배달 업체·수단 (안내 전용, 결제 금액에 포함되지 않음)
              </label>
              <input
                type="text"
                value={values.deliveryCourierLabel}
                onChange={(e) => setValues((v) => ({ ...v, deliveryCourierLabel: e.target.value }))}
                placeholder="예: Grab, 매장 직원 배달 등"
                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                무료배달 기준 (₱, 숫자)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={values.freeDeliveryOverPhp}
                onChange={(e) => setValues((v) => ({ ...v, freeDeliveryOverPhp: e.target.value }))}
                placeholder="예: 2000 — 상품 합계 이상이면 배달 청구 배달비 0·매장 창 안내에 반영"
                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">매장 창 공지 (선택)</label>
              <p className="mb-2 sam-text-xxs leading-relaxed text-sam-muted">
                고객 매장 화면에 위에서 아래 순으로 &quot;공지&quot; 라벨과 함께 표시됩니다. 공지가 없으면 아래 무료배달 기준만
                amber 안내에 자동 표시됩니다.
              </p>
              {values.publicNotices.length === 0 ? (
                <p className="mb-2 sam-text-helper text-sam-meta">등록된 공지가 없습니다.</p>
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
                        placeholder={`공지 내용 ${i + 1}`}
                        className={`min-w-0 flex-1 ${OWNER_STORE_CONTROL_COMPACT_BLOCK_CLASS}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setValues((v) => ({
                            ...v,
                            publicNotices: v.publicNotices.filter((_, j) => j !== i),
                          }))
                        }
                        className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-2 sam-text-helper font-medium text-sam-fg active:bg-sam-app"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setValues((v) => ({ ...v, publicNotices: [...v.publicNotices, ""] }))}
                className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg active:bg-sam-app"
              >
                공지 추가
              </button>
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">배달비·지역 상세 (메뉴 탭 접기 안내)</label>
              <textarea
                value={values.deliveryNotice}
                onChange={(e) => setValues((v) => ({ ...v, deliveryNotice: e.target.value }))}
                rows={4}
                placeholder="지역별 배달비, 유의사항 등 여러 줄 입력 가능"
                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">예상 배달 소요</label>
              <input
                type="text"
                value={values.avgDeliveryTime}
                onChange={(e) => setValues((v) => ({ ...v, avgDeliveryTime: e.target.value }))}
                placeholder="예: 44-52분"
                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">평균 채팅 응답 (가게정보)</label>
              <input
                type="text"
                value={values.avgChatResponse}
                onChange={(e) => setValues((v) => ({ ...v, avgChatResponse: e.target.value }))}
                placeholder="예: 1분 이내"
                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">예상 준비 시간 라벨 (내부 안내용)</label>
              <input
                type="text"
                value={values.estPrepLabel}
                onChange={(e) => setValues((v) => ({ ...v, estPrepLabel: e.target.value }))}
                placeholder="예: 20~40분 — 일부 UI·주문 흐름에서 참고"
                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="max-w-full min-w-0 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3">
        <h3 className="sam-text-body font-semibold text-sam-fg">갤러리 이미지 (전단지·소개 사진)</h3>
        <p className="mt-1 break-words sam-text-helper leading-relaxed text-sam-muted">
          매장 <strong>메인 상단에는 표시되지 않습니다</strong>. 고객은 「가게정보」→「전단지·소개」에서 봅니다.
          사진은 파일 업로드로만 추가합니다(최대 {GALLERY_MAX}장). Storage에 올라간 뒤 저장 시 함께 반영됩니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex min-h-[44px] min-w-0 cursor-pointer items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:cursor-not-allowed disabled:opacity-50">
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
            {uploading === "gallery" ? "업로드 중…" : "파일에서 추가"}
          </label>
          <span className="flex min-w-0 items-center sam-text-helper text-sam-meta">
            {values.galleryUrls.filter((u) => u.trim()).length}/{GALLERY_MAX}장
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {values.galleryUrls.filter((u) => u.trim()).length === 0 ? (
            <li className="col-span-full sam-text-body-secondary text-sam-meta">
              등록된 이미지가 없습니다. 위에서 파일을 선택해 추가하세요.
            </li>
          ) : (
            values.galleryUrls.map((url, i) => {
              const u = url.trim();
              if (!u) return null;
              return (
                <li
                  key={`${i}-${u.slice(0, 48)}`}
                  className="relative aspect-square min-w-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app"
                >
                  { }
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
                    삭제
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </form>

    {dockAboveBottomNav ? (
      <div
        className={`pointer-events-auto fixed inset-x-0 z-30 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS} ${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} box-border w-full min-w-0 max-w-full bg-sam-surface`}
      >
        {actionBarInner}
      </div>
    ) : (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        <div
          className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pointer-events-auto box-border w-full min-w-0 max-w-full`}
        >
          {actionBarInner}
        </div>
      </div>
    )}
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

/**
 * 매장 공개 메타(배달·결제·공지) 단일 출처: `stores.business_hours_json`.
 *
 * - 쓰기: `OwnerStoreProfileForm` → PATCH `/api/me/stores/[storeId]` (신규 매장은 POST 신청 후 `{}`에서 시작).
 * - 공지 배열: `public_notices` (+ 레거시 `promo_banner`는 읽기 시 `readPublicNoticesFromBusinessRecord`에서 병합).
 * - 고객 표시: `StorePublicNoticesList` + `parseStoreDeliveryMeta` — 매장 메인·가게정보 동일 데이터.
 */
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { paymentMethodsLineFromBusinessRecord } from "@/lib/stores/payment-methods-config";
import { normalizeHHMM } from "@/lib/stores/store-auto-hours";

/**
 * `매일 09:00–22:00 (Asia/Manila)` 등 → UI용 `09:00–22:00` 만.
 * 시간 패턴이 없으면 원문 유지.
 */
export function compactStoreHoursRangeForDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "—";
  const m = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/.exec(t);
  if (!m) return t;
  const o1 = normalizeHHMM(m[1]);
  const o2 = normalizeHHMM(m[2]);
  if (o1 && o2) return `${o1}–${o2}`;
  return t;
}

/**
 * 매장 창 공지 — `public_notices`(배열) 우선, 없으면 레거시 `promo_banner` 한 줄.
 */
export function readPublicNoticesFromBusinessRecord(raw: unknown): string[] {
  const o = coerceBusinessHoursRecord(raw);
  const rawArr = o.public_notices ?? o.publicNotices;
  if (Array.isArray(rawArr)) {
    return rawArr.map((x) => String(x).trim()).filter(Boolean);
  }
  const legacy = String(o.promo_banner ?? o.promoBanner ?? "").trim();
  return legacy ? [legacy] : [];
}

/**
 * 공개 매장 상세 — business_hours_json 확장 필드 (없으면 기본값)
 * 오너 폼에 입력 UI가 없어도 JSON으로 넣으면 반영됩니다.
 */
export type StoreDeliveryMeta = {
  weekdaysLine: string;
  deliveryHoursLine: string;
  paymentMethodsLine: string;
  /** 매장 창에 위→아래 순으로 노출 */
  publicNotices: string[];
  freeDeliveryOverPhp: number | null;
  deliveryNotice: string;
  avgDeliveryTimeLabel: string;
  breakTimeLabel: string;
  avgChatResponseLabel: string;
};

export function parseStoreDeliveryMeta(
  raw: unknown,
  fallbackWeekdays: string
): StoreDeliveryMeta {
  const o = coerceBusinessHoursRecord(raw);
  const weekdays = String(o.weekdays ?? "").trim();
  const dh = String(o.delivery_hours ?? o.deliveryHours ?? "").trim();
  const pay = paymentMethodsLineFromBusinessRecord(o);
  const publicNotices = readPublicNoticesFromBusinessRecord(raw);
  const notice = String(o.delivery_notice ?? o.deliveryNotice ?? "").trim();
  const avgDel = String(o.avg_delivery_time ?? o.avgDeliveryTime ?? "").trim();
  const bh = o.break_hours;
  let br = "";
  if (bh && typeof bh === "object" && !Array.isArray(bh)) {
    const r = bh as Record<string, unknown>;
    const s =
      typeof r.start === "string"
        ? normalizeHHMM(r.start)
        : typeof r.open === "string"
          ? normalizeHHMM(r.open)
          : null;
    const e =
      typeof r.end === "string"
        ? normalizeHHMM(r.end)
        : typeof r.close === "string"
          ? normalizeHHMM(r.close)
          : null;
    if (s && e && s !== e) br = `${s}–${e}`;
  }
  if (!br) br = String(o.break_time ?? o.breakTime ?? "").trim();
  const chat = String(o.avg_chat_response ?? o.avgChatResponse ?? "").trim();
  const freeRaw = Number(o.free_delivery_over_php ?? o.freeDeliveryOverPhp);

  return {
    weekdaysLine: weekdays || fallbackWeekdays,
    deliveryHoursLine: dh || weekdays || fallbackWeekdays,
    paymentMethodsLine: pay || "GCash · 만나서 결제 등 (매장 확인)",
    publicNotices,
    freeDeliveryOverPhp: Number.isFinite(freeRaw) && freeRaw > 0 ? Math.round(freeRaw) : null,
    deliveryNotice: notice,
    avgDeliveryTimeLabel: avgDel || "30~50분",
    breakTimeLabel: br || "없음",
    avgChatResponseLabel: chat || "—",
  };
}

export function readWeekdaysLineFromJson(raw: unknown): string {
  const o = coerceBusinessHoursRecord(raw);
  return String(o.weekdays ?? "").trim();
}

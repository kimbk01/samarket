/**
 * 내정보 날짜·시간·금액 표시 SSOT (최종 설계 §1.2 `formatMypageDate`).
 *
 * - locale = 회원 언어(`getRuntimeAppLanguage` — AppLanguageProvider 동기화 값), `lang` 으로 지정 가능.
 * - 시간대 = 서비스 지역 필리핀 시간(`Asia/Manila`, UTC+8). DB 저장값(UTC)은 그대로 두고 표시 단계에서만 변환
 *   (AGENTS.md 규정 9). 서버 렌더·클라이언트 하이드레이션 결과도 기기 시간대와 무관하게 같다.
 * - 상대 시간은 기존 `formatRelativeTimeAgo` 재사용.
 * - 금액은 `formatMoneyPhp` / `CurrencyAmount` 만 사용 — `toLocaleString`·`₱` 직접 조합 금지(v2 §7.9).
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { localeTagForAppLanguage } from "@/lib/i18n/locale-for-app-language";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { formatMoneyPhp } from "@/lib/utils/format";

export const MYPAGE_DISPLAY_TIME_ZONE = "Asia/Manila";

export type MypageDateStyle = "date" | "datetime" | "time" | "relative";

export type FormatMypageDateOptions = {
  style?: MypageDateStyle;
  lang?: AppLanguageCode;
};

function parseIso(iso: string | number | Date | null | undefined): Date | null {
  if (iso == null || iso === "") return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STYLE_OPTIONS: Record<Exclude<MypageDateStyle, "relative">, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  datetime: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
};

/** 값이 없거나 잘못된 날짜면 빈 문자열 — 화면이 자리 표시("—" 등)를 정한다. */
export function formatMypageDate(
  iso: string | number | Date | null | undefined,
  opts?: FormatMypageDateOptions
): string {
  const d = parseIso(iso);
  if (!d) return "";
  const style = opts?.style ?? "date";
  const lang = opts?.lang ?? getRuntimeAppLanguage();
  if (style === "relative") return formatRelativeTimeAgo(d.toISOString(), lang);
  return new Intl.DateTimeFormat(localeTagForAppLanguage(lang), {
    ...STYLE_OPTIONS[style],
    timeZone: MYPAGE_DISPLAY_TIME_ZONE,
  }).format(d);
}

/**
 * 날짜·월 묶음 키(필리핀 시간 기준) — 최근 본 상품 날짜 묶음, 소멸 예정 월별 묶음 등.
 * `day` → `YYYY-MM-DD`, `month` → `YYYY-MM`. 잘못된 값이면 빈 문자열.
 */
export function mypageDateGroupKey(
  iso: string | number | Date | null | undefined,
  unit: "day" | "month" = "day"
): string {
  const d = parseIso(iso);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: MYPAGE_DISPLAY_TIME_ZONE,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const ym = `${get("year")}-${get("month")}`;
  return unit === "month" ? ym : `${ym}-${get("day")}`;
}

/** 페소 금액 — `formatMoneyPhp` 위임(포인트는 `CurrencyAmount`). 숫자가 아니면 빈 문자열. */
export function formatMypageMoney(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "";
  return formatMoneyPhp(amount);
}

/** 최근 본 상품 날짜 묶음 (최종 설계 S25) — 필리핀 시간 기준 */
export type MypageRecencyBucket = "today" | "yesterday" | "this_week" | "earlier";

export const MYPAGE_RECENCY_BUCKETS: readonly MypageRecencyBucket[] = ["today", "yesterday", "this_week", "earlier"];

function dayNumber(key: string): number {
  // `YYYY-MM-DD` → UTC 자정 기준 일 번호(같은 달력 날짜끼리 차이만 쓴다)
  const ms = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : NaN;
}

/**
 * 오늘·어제·이번 주·이전 — PHT(Asia/Manila) 달력 날짜 기준. 저장값(UTC)은 그대로.
 * 「이번 주」 = 이번 주 월요일(PHT) 이후이면서 오늘·어제가 아닌 날. 미래 시각은 오늘로 본다.
 */
export function mypageRecencyBucket(
  iso: string | number | Date | null | undefined,
  now: number | Date = Date.now()
): MypageRecencyBucket {
  const dKey = mypageDateGroupKey(iso, "day");
  const nKey = mypageDateGroupKey(now instanceof Date ? now : new Date(now), "day");
  const d = dayNumber(dKey);
  const n = dayNumber(nKey);
  if (!Number.isFinite(d) || !Number.isFinite(n)) return "earlier";
  const diff = n - d;
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  // 1970-01-01(일 번호 0)은 목요일 → 월요일=0 기준 요일
  const dowMonday0 = (((n + 3) % 7) + 7) % 7;
  const weekStart = n - dowMonday0;
  return d >= weekStart ? "this_week" : "earlier";
}

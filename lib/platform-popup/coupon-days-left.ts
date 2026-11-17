/**
 * 빌드 전 감사 P6 (2026-11-17) — 쿠폰 「n일 뒤 만료」 = 마닐라 달력 날짜 차이.
 * 예전에는 남은 ms 를 하루로 나눠 올림해 2시간 남아도 「1일」, 「오늘 만료」는 이미 지난 쿠폰에만 나왔다.
 * 0 = 오늘 만료 · 1 = 내일(1일) … 지난 쿠폰도 0(서버가 만료 전 쿠폰만 준다).
 */
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";

function manilaDayNumber(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_POPUP_DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

export function platformPopupCouponDaysLeft(expiresAtIso: string | null | undefined, nowMs: number): number | null {
  if (!expiresAtIso) return null;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, manilaDayNumber(t) - manilaDayNumber(nowMs));
}

/** 남은 시간 표시 창 — 종료까지 24시간 안일 때만 보이고, 그때만 1초마다 다시 그린다 */
export const PLATFORM_POPUP_TIME_LEFT_WINDOW_MS = 24 * 3600_000;

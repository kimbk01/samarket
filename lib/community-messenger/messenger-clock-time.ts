/**
 * 메신저 시계 시각 SSOT — 통화 발생 시각·타임라인 trailing time·통화목록 시각.
 * 지속시간(duration)과 혼동 금지. AM/PM 리터럴은 Intl(en-US)만 사용한다.
 */
export function formatMessengerClockTime(iso: string): string {
  const raw = iso.trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

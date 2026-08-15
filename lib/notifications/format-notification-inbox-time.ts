/**
 * Notification list timestamp — matches DIBAY inbox mockup:
 * today → "오전 11:45" / "11:45 AM"
 * yesterday → "어제 10:23"
 * older → "8. 7."
 */
export function formatNotificationInboxTime(
  iso: string,
  language: string,
  nowMs: number = Date.now()
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "ko" ? "ko-KR" : "en-US";
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / 86_400_000);
  const clock = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

  if (dayDiff === 0) return clock;
  if (dayDiff === 1) {
    return language === "ko" ? `어제 ${clock}` : `Yesterday ${clock}`;
  }
  return date.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

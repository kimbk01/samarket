/** 매장 신청 진행 시각 — 필리핀 시간(Asia/Manila) 표시 전용. DB 값은 UTC 그대로. */
export function formatManilaDateTimeShort(iso: string | null | undefined, language: string): string {
  const s = String(iso ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en-PH" : "ko-KR", {
    timeZone: "Asia/Manila",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * HB-6 — 배너 업로드 storage 경로의 캠페인 칸은 UUID 또는 고정 예약어만 (경로 문자·임의 문자열 금지).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBannerUploadCampaignSegment(
  raw: unknown,
  fallback: "draft" | "unbound"
): { ok: true; segment: string } | { ok: false } {
  const t = String(raw ?? "").trim();
  if (!t || t === fallback) return { ok: true, segment: fallback };
  return UUID_RE.test(t) ? { ok: true, segment: t.toLowerCase() } : { ok: false };
}

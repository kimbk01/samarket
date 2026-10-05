/** Operator-facing labels for quality reasons (client-safe: no parser imports). */
export const QUALITY_REASON_LABELS: Record<string, string> = {
  title_missing: "제목 없음",
  body_missing: "본문·이미지 모두 없음",
  images_missing: "원본 이미지 일부 누락",
  feed_fallback: "원문 페이지 수집 실패 — 피드 요약만 사용",
  entity_leak: "HTML 문자(&nbsp; 등) 노출",
  date_missing: "원본 게시일 없음",
  structure_changed: "구조 변경 의심 — 설정한 본문 위치를 찾지 못해 자동 추출함",
};

/** "a, b" reason list (as stored in last_error) → readable Korean labels; unknown codes stay as-is. */
export function labelReasons(raw: string | null | undefined): string {
  return String(raw ?? "")
    .split(/,\s*/)
    .filter(Boolean)
    .map((r) => QUALITY_REASON_LABELS[r] ?? r)
    .join(" · ");
}

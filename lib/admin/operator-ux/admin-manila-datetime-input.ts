/**
 * 관리자 `datetime-local` 입력 ↔ ISO 시각 (필리핀 시간 PHT 고정 · v4 UI-01).
 * 칸 채우기 = `isoToManilaLocal`, 저장 = `manilaLocalToIso` — 기기 시간대와 무관.
 * 입력값이 원래 값과 같으면 원래 ISO 를 그대로 돌려줘 저장만 해도 시각이 바뀌지 않는다(초 단위 보존).
 */
import { isoToManilaLocal, manilaLocalToIso } from "@/lib/launch-intro/schedule";

/** ISO → datetime-local 값 (PHT). 값 없음·잘못된 값 = "". */
export function adminIsoToManilaInput(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim();
  if (!s || !Number.isFinite(Date.parse(s))) return "";
  return isoToManilaLocal(s);
}

/**
 * datetime-local 값(PHT) → 저장할 ISO.
 * - 원래 ISO 를 칸에 채운 값과 같으면 원래 ISO 그대로 (값 불변)
 * - "" → null, 형식 오류 → undefined
 */
export function adminManilaInputToIso(
  local: string,
  originalIso?: string | null
): string | null | undefined {
  const v = String(local ?? "").trim();
  if (originalIso && v && adminIsoToManilaInput(originalIso) === v) {
    return new Date(Date.parse(originalIso)).toISOString();
  }
  return manilaLocalToIso(v);
}

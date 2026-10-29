/**
 * HA-6 — 홈 선반·업종 노출 정책의 노출 기간은 운영 기준 필리핀 시간(Asia/Manila, UTC+8, 서머타임 없음)으로 입력·표시한다.
 * DB(timestamptz)·서버 판정은 UTC 그대로 — 변환은 입력·표시 단계에서만 (AGENTS.md 시간 기준).
 */
const PHT_OFFSET = "+08:00";
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `<input type="datetime-local">` 값(PHT 벽시계) → 오프셋 붙은 ISO. 빈 값은 null */
export function phtDateTimeLocalToIso(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(t);
  return m ? `${m[1]}T${m[2]}:00${PHT_OFFSET}` : null;
}

/** 저장값(ISO, 오프셋 있거나 없음) → PHT 벽시계 `YYYY-MM-DDTHH:mm`. 오프셋 없는 기존 값은 서버 해석과 같은 UTC 로 본다 */
export function isoToPhtDateTimeLocal(value: string | null | undefined): string {
  const t = value?.trim();
  if (!t) return "";
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(t);
  const ms = Date.parse(hasZone ? t : `${t}Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + PHT_OFFSET_MS).toISOString().slice(0, 16);
}

/** 저장값 검증 — 오프셋 없는 값은 DB(UTC)가 UTC 로 해석해 PHT 입력보다 8시간 늦어지므로 서버가 거부한다 */
export function isScheduleIsoWithOffset(value: string | null | undefined): boolean {
  const t = value?.trim();
  if (!t) return true;
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(t) && Number.isFinite(Date.parse(t));
}

/**
 * 2026-11-21 메시지 보내기 2단계 — 사본 「바뀜 표시」 읽기 판정(순수 · 다른 모듈 import 없음 — 순환 방지).
 * 쓰기: `messenger-snapshot-dirty.ts` · DB: `mark_messenger_snapshots_dirty`.
 */
/**
 * 읽는 쪽 판정 — 바뀜 표시가 마지막 저장보다 늦으면 그 사본은 틀림.
 * 열이 없거나(마이그레이션 전) 값이 없으면 false(지금 동작 그대로).
 */
export function isMessengerSnapshotInvalidated(row: { updated_at?: unknown; invalidated_at?: unknown } | null): boolean {
  if (!row) return false;
  const inv = typeof row.invalidated_at === "string" ? Date.parse(row.invalidated_at) : NaN;
  const upd = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : NaN;
  if (!Number.isFinite(inv)) return false;
  if (!Number.isFinite(upd)) return true;
  return inv > upd;
}

/** 열이 아직 없는 DB(마이그레이션 전)인지 — 한 번 확인되면 그 인스턴스는 열 없이 읽는다 */
let invalidatedColumnMissing = false;
export function messengerSnapshotInvalidatedColumnAvailable(): boolean {
  return !invalidatedColumnMissing;
}
export function noteMessengerSnapshotInvalidatedColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "");
  if ((error.code === "42703" || /column/i.test(msg)) && msg.includes("invalidated_at")) {
    invalidatedColumnMissing = true;
    return true;
  }
  return false;
}

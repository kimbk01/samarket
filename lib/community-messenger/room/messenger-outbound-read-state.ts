/**
 * P1 전송 상태 SSOT — 내 메시지의 전송·읽음 상태 판정 (기존 데이터만, DB·API 무변경).
 * 설계: docs/audit/messenger-chat-audit-2026-11-18/appendix-P1-send-status-design.md B-1.
 *
 * - 전송 중 = `pending && !sendFailed`, 실패 = `pending && sendFailed` (행 데이터로만 판정)
 * - 1:1 읽음 = 상대 읽음 커서와 `(createdAt, id)` 튜플 비교. 서버 그룹 읽음 RPC·실시간 커서 가드와 같은 순서.
 *   id 단독 순서는 쓰지 않는다(무작위 uuid).
 * - 비공개 그룹 읽음 = 읽음 수 ≥ 1 인 내 메시지 중 가장 늦은 튜플 이하 전부(커서 기반이라 단조).
 * - 오픈 그룹 = 읽음 데이터 없음 → 저장됨까지만.
 */

export type MessengerOutboundStatus = "sending" | "failed" | "sent" | "read";

/**
 * 타임라인 → 행 컴포넌트로 넘기는 원시 문자열(memo 비교기 유지).
 * - `read` / `unread`: 읽음 추적 방(1:1·비공개 그룹)의 확정 내 메시지
 * - `sent`: 읽음 추적 없는 방(오픈 그룹)의 확정 내 메시지
 * - `none`: 상태 표시 없음(남의 메시지·시스템·통화 기록·삭제 묘비) 또는 보내는 중 행(행이 직접 판정)
 */
export type MessengerOutboundReadState = "read" | "unread" | "sent" | "none";

/**
 * `t` = ms(Date), `us` = ms 아래 마이크로초(0~999). Postgres `timestamptz` 는 µs 정밀도라
 * 같은 ms 안의 두 메시지도 서버 순서 `(created_at µs, id)` 와 같게 비교한다(리뷰 #3).
 */
export type MessengerReadOrderKey = { t: number; us?: number; id: string };

export type MessengerReadMode = "direct" | "private_group" | "untracked";

type OrderRow = { id: string; createdAt: string; pending?: boolean };

/** 원문 시각의 소수부에서 ms 아래 µs 3자리 — 없으면 0 */
export function messengerSubMillisecondMicros(raw: string): number {
  const m = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(raw);
  if (!m) return 0;
  const digits = (m[1]! + "000000").slice(0, 6);
  const us = Number(digits.slice(3, 6));
  return Number.isFinite(us) ? us : 0;
}

export function messengerReadOrderKey(createdAt: string | null | undefined, id: string): MessengerReadOrderKey | null {
  const raw = typeof createdAt === "string" ? createdAt.trim() : "";
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return { t, us: messengerSubMillisecondMicros(raw), id };
}

/** a 가 b 보다 앞이면 음수 — 시각(ms → µs) 오름차순, 같은 시각이면 id 문자열 오름차순(서버 `lr.id >= m.id` 와 같은 방향) */
export function compareMessengerReadOrderKey(a: MessengerReadOrderKey, b: MessengerReadOrderKey): number {
  if (a.t !== b.t) return a.t - b.t;
  const ua = a.us ?? 0;
  const ub = b.us ?? 0;
  if (ua !== ub) return ua - ub;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * 1:1 상대 읽음 커서 튜플.
 * 커서 id 가 화면(또는 스냅샷) 확정 행에 있으면 그 행의 createdAt, 없으면 서버가 내려준 `lastReadMessageCreatedAt`,
 * 둘 다 없으면 판정 불가(null) → 모두 「저장됨」(과소 표시 쪽).
 */
export function resolveDirectPeerReadCursorKey(args: {
  lastReadMessageId: string | null | undefined;
  lastReadMessageCreatedAt: string | null | undefined;
  rows: readonly OrderRow[];
  fallbackRows?: readonly OrderRow[];
}): MessengerReadOrderKey | null {
  const cursorId = typeof args.lastReadMessageId === "string" ? args.lastReadMessageId.trim() : "";
  if (!cursorId) return null;
  const find = (rows: readonly OrderRow[] | undefined) => {
    if (!rows) return undefined;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const r = rows[i]!;
      if (r.pending) continue;
      if (r.id === cursorId) return r;
    }
    return undefined;
  };
  const row = find(args.rows) ?? find(args.fallbackRows);
  if (row) {
    const k = messengerReadOrderKey(row.createdAt, cursorId);
    if (k) return k;
  }
  return messengerReadOrderKey(args.lastReadMessageCreatedAt, cursorId);
}

/** 비공개 그룹 — 읽음 수 ≥ 1 인 내 확정 메시지 중 가장 늦은 튜플. 없으면 null(전부 저장됨). */
export function resolveGroupReadFloorKey(
  rows: readonly (OrderRow & { isMine?: boolean })[],
  counts: Readonly<Record<string, { readCount: number } | undefined>>
): MessengerReadOrderKey | null {
  let floor: MessengerReadOrderKey | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    if (!r.isMine || r.pending) continue;
    const c = counts[r.id];
    if (!c || !(c.readCount >= 1)) continue;
    const k = messengerReadOrderKey(r.createdAt, r.id);
    if (!k) continue;
    if (!floor || compareMessengerReadOrderKey(k, floor) > 0) floor = k;
  }
  return floor;
}

type StatusRow = {
  id: string;
  createdAt: string;
  isMine: boolean;
  messageType: string;
  pending?: boolean;
  sendFailed?: boolean;
  deletedForEveryoneAt?: string | null;
};

function rowCarriesOutboundStatus(row: StatusRow): boolean {
  if (!row.isMine) return false;
  if (row.messageType === "system" || row.messageType === "call_stub") return false;
  if (typeof row.deletedForEveryoneAt === "string" && row.deletedForEveryoneAt.trim()) return false;
  return true;
}

/** 타임라인에서 행마다 O(1) — 확정 내 메시지의 읽음 상태 */
export function resolveMessengerOutboundReadState(
  row: StatusRow,
  mode: MessengerReadMode,
  readKey: MessengerReadOrderKey | null
): MessengerOutboundReadState {
  if (!rowCarriesOutboundStatus(row) || row.pending) return "none";
  if (mode === "untracked") return "sent";
  if (!readKey) return "unread";
  const k = messengerReadOrderKey(row.createdAt, row.id);
  if (!k) return "unread";
  return compareMessengerReadOrderKey(k, readKey) <= 0 ? "read" : "unread";
}

/** 행 컴포넌트 — 표시할 아이콘 상태(없으면 null) */
export function resolveMessengerOutboundStatus(
  row: StatusRow,
  readState: MessengerOutboundReadState
): MessengerOutboundStatus | null {
  if (!rowCarriesOutboundStatus(row)) return null;
  if (row.pending) return row.sendFailed ? "failed" : "sending";
  if (readState === "read") return "read";
  if (readState === "unread" || readState === "sent") return "sent";
  return null;
}

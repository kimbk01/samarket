/**
 * D4 ②③ 1단계 (Owner 「②③ 승인」 2026-11-19) — 방 진입·이어받기 DB 함수 1번 호출을 **그림자 비교**만 한다.
 * 화면·응답은 기존 경로 그대로. 표본 요청에서만 새 DB 함수를 1번 더 부른다(기본 10%).
 *
 * ② 방 진입(bootstrap critical): 기존 경로가 같은 요청 안에서 실제로 받은 원본
 *    (room_access · 방 스냅샷 RPC · 1:1 관계 · 그룹 활성/강퇴/접속 원본)을 기록해 두고,
 *    응답 뒤 `community_messenger_room_entry` 결과와 원본끼리 비교한다. 입력이 같으면 TS 가공 결과도 같다.
 * ③ 이어받기(messages?after=): 새 경로로 최종 메시지 목록까지 만들어 기존 응답과 통째로 비교한다.
 *
 * 근거: docs/audit/supabase-request-surge-2026-11-18/d4-room-entry-analysis-2026-11-19.md
 *       supabase/migrations/20271119170000_cm_room_entry_and_messages_after_page.sql
 */

export const ROOM_ENTRY_SHADOW_DEFAULT_RATE = 0.1;

export function resolveRoomEntryShadowRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.SAMARKET_ROOM_ENTRY_SHADOW_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return ROOM_ENTRY_SHADOW_DEFAULT_RATE;
}

export function shouldSampleRoomEntryShadow(rate = resolveRoomEntryShadowRate(), random: () => number = Math.random): boolean {
  return random() < rate;
}

export type RoomEntryShadowCapture = {
  /** room_access 원본 — 부른 roomKey 별 */
  accessByRoomKey: Map<string, unknown>;
  /** 방 스냅샷 RPC 원본 (critical) */
  snapshot: { userId: string; roomId: string; messageLimit: number; data: unknown } | null;
  /** 1:1 관계 원본 — 상대별 */
  pairFactsByPeer: Map<string, unknown>;
  /** 그룹 접속 계산 원본 */
  group: { activeUserIds: string[]; bannedUserIds: string[]; presenceUserIds: string[] } | null;
};

type AlsLike<T> = { run<R>(store: T, fn: () => R): R; getStore(): T | undefined };

/** Next.js 서버 런타임이 `globalThis.AsyncLocalStorage` 를 제공한다 — 없으면(테스트·클라) 기록하지 않는다. */
function createAls(): AlsLike<RoomEntryShadowCapture> | null {
  const Ctor = (globalThis as { AsyncLocalStorage?: new () => AlsLike<RoomEntryShadowCapture> }).AsyncLocalStorage;
  return typeof Ctor === "function" ? new Ctor() : null;
}

const g = globalThis as { __samarketRoomEntryShadowAls?: AlsLike<RoomEntryShadowCapture> | null };
function als(): AlsLike<RoomEntryShadowCapture> | null {
  if (g.__samarketRoomEntryShadowAls === undefined) g.__samarketRoomEntryShadowAls = createAls();
  return g.__samarketRoomEntryShadowAls;
}

export function newRoomEntryShadowCapture(): RoomEntryShadowCapture {
  return { accessByRoomKey: new Map(), snapshot: null, pairFactsByPeer: new Map(), group: null };
}

/** 표본 요청만 기록 범위 안에서 실행. 기록 장치가 없으면 그냥 실행. */
export function runWithRoomEntryShadowCapture<R>(capture: RoomEntryShadowCapture | null, fn: () => R): R {
  const a = als();
  if (!capture || !a) return fn();
  return a.run(capture, fn);
}

function current(): RoomEntryShadowCapture | undefined {
  try {
    return als()?.getStore();
  } catch {
    return undefined;
  }
}

export function recordRoomEntryShadowAccess(roomKey: string, data: unknown): void {
  const c = current();
  if (c && roomKey) c.accessByRoomKey.set(roomKey, data);
}

export function recordRoomEntryShadowSnapshot(userId: string, roomId: string, messageLimit: number, data: unknown): void {
  const c = current();
  if (c) c.snapshot = { userId, roomId, messageLimit, data };
}

export function recordRoomEntryShadowPairFacts(peerUserId: string, data: unknown): void {
  const c = current();
  if (c && peerUserId) c.pairFactsByPeer.set(peerUserId, data);
}

export function recordRoomEntryShadowGroup(group: RoomEntryShadowCapture["group"]): void {
  const c = current();
  if (c) c.group = group;
}

/** jsonb 비교용 — 키 순서 무관 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

function sortedIds(v: unknown): string {
  return (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).sort().join(",");
}

function withoutUpdatedAt(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const { updated_at: _u, ...rest } = v as Record<string, unknown>;
  return rest;
}

export type RoomEntryShadowDiff = { compared: string[]; mismatched: string[] };

/** 기록한 원본 ↔ room_entry 결과. 기록하지 않은 항목(캐시 적중 등)은 비교하지 않는다. */
export function diffRoomEntryShadow(capture: RoomEntryShadowCapture, entry: unknown): RoomEntryShadowDiff {
  const e = (entry ?? {}) as {
    access?: unknown;
    snapshot?: unknown;
    pair_facts_by_peer?: Record<string, unknown>;
    group_online?: { active_user_ids?: unknown; banned_user_ids?: unknown; presence_rows?: unknown } | null;
  };
  const compared: string[] = [];
  const mismatched: string[] = [];
  const check = (key: string, same: boolean) => {
    compared.push(key);
    if (!same) mismatched.push(key);
  };
  const roomId = capture.snapshot?.roomId ?? "";
  if (capture.accessByRoomKey.has(roomId)) {
    check("access", stableJson(capture.accessByRoomKey.get(roomId)) === stableJson(e.access));
  }
  if (capture.snapshot) {
    check("snapshot", stableJson(withoutUpdatedAt(capture.snapshot.data)) === stableJson(withoutUpdatedAt(e.snapshot)));
  }
  for (const [peer, facts] of capture.pairFactsByPeer) {
    check("pair_facts", stableJson(facts) === stableJson(e.pair_facts_by_peer?.[peer] ?? null));
  }
  if (capture.group) {
    const go = e.group_online ?? {};
    check("group_active", sortedIds(capture.group.activeUserIds) === sortedIds(go.active_user_ids));
    check("group_banned", sortedIds(capture.group.bannedUserIds) === sortedIds(go.banned_user_ids));
    const presenceIds = (Array.isArray(go.presence_rows) ? go.presence_rows : []).map(
      (r) => (r as { user_id?: unknown })?.user_id
    );
    check("group_presence_users", sortedIds(capture.group.presenceUserIds) === sortedIds(presenceIds));
  }
  return { compared, mismatched };
}

/** 응답 뒤(after) 실행 — 새 DB 함수 1번 + 비교 로그. 오류는 조용히 건너뜀(마이그레이션 전 포함). */
export async function runRoomEntryShadowCompare(sb: unknown, capture: RoomEntryShadowCapture): Promise<RoomEntryShadowDiff | null> {
  const snap = capture.snapshot;
  if (!snap || !sb) return null;
  try {
    const { data, error } = await (sb as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> }).rpc(
      "community_messenger_room_entry",
      { p_user_id: snap.userId, p_room_key: snap.roomId, p_message_limit: snap.messageLimit }
    );
    if (error) return null;
    const diff = diffRoomEntryShadow(capture, data);
    const log = { roomIdTail: snap.roomId.slice(-8), compared: diff.compared, mismatched: diff.mismatched };
    if (diff.mismatched.length) console.warn("[room-entry-shadow]", log);
    else console.info("[room-entry-shadow]", { ...log, match: true });
    return diff;
  } catch {
    return null;
  }
}

/** ③ 이어받기 — 기존 응답 ↔ 새 경로 응답 (메시지 목록·hasMore) */
export function diffMessagesAfterShadow(
  oldResult: { messages: unknown[]; hasMore: boolean },
  nextResult: { ok: boolean; messages?: unknown[]; hasMore?: boolean; error?: string }
): { match: boolean; reason?: string } {
  if (!nextResult.ok) return { match: false, reason: `next_error:${nextResult.error ?? "unknown"}` };
  if (oldResult.hasMore !== nextResult.hasMore) return { match: false, reason: "has_more" };
  const a = oldResult.messages ?? [];
  const b = nextResult.messages ?? [];
  if (a.length !== b.length) return { match: false, reason: "count" };
  for (let i = 0; i < a.length; i += 1) {
    if (stableJson(a[i]) !== stableJson(b[i])) return { match: false, reason: `message_${i}` };
  }
  return { match: true };
}

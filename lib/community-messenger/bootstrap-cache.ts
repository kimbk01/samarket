import type { CommunityMessengerBootstrap, CommunityMessengerBootstrapCritical } from "@/lib/community-messenger/types";

const TTL_MS = 5 * 60 * 1000;
const SS_KEY_FULL = "samarket.messenger.bootstrap.v1";
const SS_KEY_CRITICAL = "samarket.messenger.bootstrap.critical.v1";
/** lite 네트워크 단축과 동일 페이로드 형태 — 별도 TTL 로 세션 복원 우선순위 조정 가능 */
const SS_KEY_MINIMAL = "samarket.messenger.bootstrap.minimal.v1";
/**
 * P2-9 — `lib/auth/client-instance-id.ts` `DIBAY_AUTH_BOUND_USER_ID_KEY` 와 동일 키.
 * (그 모듈은 "use client" 경계라 서버 그래프에서도 안전하도록 문자열만 공유)
 */
const BOUND_VIEWER_LS_KEY = "dibay:auth_bound_user_id";

type CacheEntry<T> = { data: T; at: number; viewerId: string | null };

let memoryFullCache: CacheEntry<CommunityMessengerBootstrap> | null = null;
let memoryCriticalCache: CacheEntry<CommunityMessengerBootstrapCritical> | null = null;
let memoryMinimalCache: CacheEntry<CommunityMessengerBootstrap> | null = null;

/**
 * P2-9 — 로그아웃·계정 전환 epoch. 시작 시점 epoch 를 넘긴 prime 은 epoch 가 바뀌었으면 버린다
 * (로그아웃 대기 중 늦게 도착한 이전 사용자 응답이 캐시에 다시 쓰이는 것 차단).
 */
let bootstrapCacheAuthEpoch = 0;

export function getMessengerBootstrapCacheAuthEpoch(): number {
  return bootstrapCacheAuthEpoch;
}

export function bumpMessengerBootstrapCacheAuthEpoch(): number {
  bootstrapCacheAuthEpoch += 1;
  return bootstrapCacheAuthEpoch;
}

export type MessengerBootstrapPrimeOptions = {
  /** 요청 시작 시 `getMessengerBootstrapCacheAuthEpoch()` — 다르면 쓰기 무시 */
  authEpoch?: number;
  /**
   * 1단계 결함 D-7 W1 (2026-10-26): 서버 응답을 그대로 기록할 때만 true — 「서버로 확인한 시각」 갱신.
   * 로컬 부분 갱신(안 읽음 수·미리보기 패치 등)은 생략 → 이전 확인 시각 유지.
   */
  networkConfirmed?: boolean;
};

/**
 * D-7 W1: 목록 캐시가 마지막으로 서버 응답과 맞춰진 시각(메모리 전용).
 * `at`(캐시 기록 시각)은 로컬 부분 갱신마다 다시 찍혀 「신선」 판단이 서버 확인과 무관해졌다(실기기 05:12 — 13분 동안 5분 TTL 안).
 */
let networkConfirmedAt: { at: number; viewerId: string | null } | null = null;

function noteBootstrapNetworkConfirmed(viewerId: string | null): void {
  networkConfirmedAt = { at: Date.now(), viewerId };
}

/** D-7 W1: 서버로 확인한 뒤 지난 ms — 확인 기록이 없거나 다른 사용자면 null */
export function getBootstrapCacheNetworkConfirmedAgeMs(): number | null {
  if (!networkConfirmedAt) return null;
  if (!entryMatchesViewer(networkConfirmedAt.viewerId, readBoundViewerId())) return null;
  return Math.max(0, Date.now() - networkConfirmedAt.at);
}

function normalizeViewerId(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

function readBoundViewerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeViewerId(window.localStorage.getItem(BOUND_VIEWER_LS_KEY));
  } catch {
    return null;
  }
}

/** 명시 viewerId(문자열/null) 우선, 생략 시 현재 기기 bound user */
function resolveExpectedViewerId(viewerId: string | null | undefined): string | null {
  if (viewerId !== undefined) return normalizeViewerId(viewerId);
  return readBoundViewerId();
}

/** 기대 viewer 가 확정이면 entry viewer 와 정확히 같아야 한다 (unknown entry 포함 불일치 = 폐기) */
function entryMatchesViewer(entryViewerId: string | null, expected: string | null): boolean {
  if (!expected) return true;
  return entryViewerId === expected;
}

function payloadViewerId(data: { me?: { id?: string | null } | null } | null | undefined): string | null {
  return normalizeViewerId(data?.me?.id);
}

/** 쓰기 허용 여부 — 오래된 epoch 또는 현재 bound user 와 다른 viewer 페이로드는 거부 */
function resolvePrimeViewerId(
  data: { me?: { id?: string | null } | null },
  options?: MessengerBootstrapPrimeOptions
): { ok: true; viewerId: string | null } | { ok: false } {
  if (typeof options?.authEpoch === "number" && options.authEpoch !== bootstrapCacheAuthEpoch) {
    return { ok: false };
  }
  const bound = readBoundViewerId();
  const fromPayload = payloadViewerId(data);
  if (bound && fromPayload && bound !== fromPayload) return { ok: false };
  return { ok: true, viewerId: fromPayload ?? bound };
}

function readSessionEntry<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T; viewerId?: string | null };
    if (!parsed?.data) return null;
    return { data: parsed.data, at: parsed.at, viewerId: normalizeViewerId(parsed.viewerId) };
  } catch {
    return null;
  }
}

function readSessionFull(expected: string | null): CommunityMessengerBootstrap | null {
  const entry = readSessionEntry<CommunityMessengerBootstrap>(SS_KEY_FULL);
  if (!entry || !entryMatchesViewer(entry.viewerId, expected)) return null;
  memoryFullCache = entry;
  return entry.data;
}

function readSessionCritical(expected: string | null): CommunityMessengerBootstrapCritical | null {
  const entry = readSessionEntry<CommunityMessengerBootstrapCritical>(SS_KEY_CRITICAL);
  if (!entry || entry.data.tier !== "critical") return null;
  if (!entryMatchesViewer(entry.viewerId, expected)) return null;
  memoryCriticalCache = entry;
  return entry.data;
}

function readSessionMinimal(expected: string | null): CommunityMessengerBootstrap | null {
  const entry = readSessionEntry<CommunityMessengerBootstrap>(SS_KEY_MINIMAL);
  if (!entry || !entryMatchesViewer(entry.viewerId, expected)) return null;
  memoryMinimalCache = entry;
  return entry.data;
}

/**
 * SPA 재진입·새로고침 직후 첫 페인트용 full 부트스트랩(stale 포함 — SWR 즉시 렌더).
 * @param viewerId 생략 시 현재 기기 bound user — 다른 viewer 의 엔트리는 null.
 */
export function peekMessengerBootstrapFull(viewerId?: string | null): CommunityMessengerBootstrap | null {
  const expected = resolveExpectedViewerId(viewerId);
  if (memoryFullCache) {
    return entryMatchesViewer(memoryFullCache.viewerId, expected) ? memoryFullCache.data : null;
  }
  return readSessionFull(expected);
}

/** critical 전용 스냅샷 — full 없이도 목록 즉시 표시용 */
export function peekMessengerBootstrapCritical(
  viewerId?: string | null
): CommunityMessengerBootstrapCritical | null {
  const expected = resolveExpectedViewerId(viewerId);
  if (memoryCriticalCache) {
    return entryMatchesViewer(memoryCriticalCache.viewerId, expected) ? memoryCriticalCache.data : null;
  }
  return readSessionCritical(expected);
}

/** deferred lite 응답 캐시(형태는 full 과 동일). */
export function peekMessengerBootstrapMinimal(viewerId?: string | null): CommunityMessengerBootstrap | null {
  const expected = resolveExpectedViewerId(viewerId);
  if (memoryMinimalCache) {
    return entryMatchesViewer(memoryMinimalCache.viewerId, expected) ? memoryMinimalCache.data : null;
  }
  return readSessionMinimal(expected);
}

/** @deprecated peekMessengerBootstrapFull 와 동일 — 호환 유지 */
export function peekBootstrapCache(): CommunityMessengerBootstrap | null {
  return peekMessengerBootstrapFull();
}

export function isBootstrapCacheFresh(): boolean {
  if (memoryFullCache && entryMatchesViewer(memoryFullCache.viewerId, readBoundViewerId())) {
    return Date.now() - memoryFullCache.at <= TTL_MS;
  }
  return false;
}

export function isCriticalBootstrapCacheFresh(): boolean {
  if (memoryCriticalCache && entryMatchesViewer(memoryCriticalCache.viewerId, readBoundViewerId())) {
    return Date.now() - memoryCriticalCache.at <= TTL_MS;
  }
  return false;
}

export function primeMessengerBootstrapFull(
  data: CommunityMessengerBootstrap,
  options?: MessengerBootstrapPrimeOptions
) {
  /**
   * S-13 (1단계 문서 §14 · 2026-10-25 Samsung 실측): critical(상위 30방·보관/알림 필드 없음) 시드 상태의 홈 데이터를
   * 여기서 "full" 로 찍어 저장하면, 뒤이은 lite 요청이 이 캐시를 full 로 믿고 네트워크 없이 단락한다
   * (`cm-bootstrap-client-fetch.ts` lite cache hit) → 홈이 영구히 30방(보관 0·알림 끔 비활성).
   * 부분 데이터는 full slot 에 쓰지 않는다 — full 은 실제 full/lite 응답이 적용된 뒤에만.
   */
  if (data.clientHydrationTier === "critical") return;
  const gate = resolvePrimeViewerId(data, options);
  if (!gate.ok) return;
  // 기본 prime 은 non-network 경로로 간주 — 동일 slot 의 stale provenance 를 먼저 제거한다.
  // 실제 Warm Network 경로는 prime 직후 recordWarmNetworkProvenance("full", …) 로 다시 기록한다.
  clearWarmNetworkProvenance("full");
  const tiered = { ...data, clientHydrationTier: "full" as const };
  const at = Date.now();
  memoryFullCache = { data: tiered, at, viewerId: gate.viewerId };
  if (options?.networkConfirmed) noteBootstrapNetworkConfirmed(gate.viewerId);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_FULL, JSON.stringify({ at, data: tiered, viewerId: gate.viewerId }));
  } catch {
    // ignore quota / private mode
  }
}

export function primeMessengerBootstrapCritical(
  data: CommunityMessengerBootstrapCritical,
  options?: MessengerBootstrapPrimeOptions
) {
  const gate = resolvePrimeViewerId(data, options);
  if (!gate.ok) return;
  clearWarmNetworkProvenance("critical");
  const at = Date.now();
  memoryCriticalCache = { data, at, viewerId: gate.viewerId };
  if (options?.networkConfirmed) noteBootstrapNetworkConfirmed(gate.viewerId);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_CRITICAL, JSON.stringify({ at, data, viewerId: gate.viewerId }));
  } catch {
    // ignore
  }
}

export function primeMessengerBootstrapMinimal(
  data: CommunityMessengerBootstrap,
  options?: MessengerBootstrapPrimeOptions
) {
  const gate = resolvePrimeViewerId(data, options);
  if (!gate.ok) return;
  const at = Date.now();
  memoryMinimalCache = { data, at, viewerId: gate.viewerId };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_MINIMAL, JSON.stringify({ at, data, viewerId: gate.viewerId }));
  } catch {
    // ignore
  }
}

/** @deprecated primeMessengerBootstrapFull 와 동일 */
export function primeBootstrapCache(data: CommunityMessengerBootstrap, options?: MessengerBootstrapPrimeOptions) {
  primeMessengerBootstrapFull(data, options);
}

/**
 * @param options.authExit 로그아웃·계정 전환 wipe — auth epoch 도 올려 진행 중 요청의 늦은 쓰기를 버린다.
 */
export function clearBootstrapCache(options?: { authExit?: boolean }) {
  if (options?.authExit) bumpMessengerBootstrapCacheAuthEpoch();
  memoryFullCache = null;
  memoryCriticalCache = null;
  memoryMinimalCache = null;
  networkConfirmedAt = null;
  clearWarmNetworkProvenance("full");
  clearWarmNetworkProvenance("critical");
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SS_KEY_FULL);
    sessionStorage.removeItem(SS_KEY_CRITICAL);
    sessionStorage.removeItem(SS_KEY_MINIMAL);
  } catch {
    // ignore
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Warm Network Provenance (memory-only, one-shot) — WARM_GATE_INTEGRATION
//
// 계약:
//  - 실제 Warm Network 응답에서만 생성 (synthetic/cache/sessionStorage 복원 금지)
//  - sessionStorage 에 저장하지 않는다 (메모리 전용, runtimeMeta·gate 상태 미보관)
//  - one-shot: 검증 통과 소비 즉시 삭제, 재사용 불가
//  - non-network prime(캐시 재기록) 시 동일 slot provenance 삭제
//  - Kill/LEGACY·gateVersion 불일치 provenance 로 CANONICAL 승격 금지
//  - fingerprint 는 정렬된 roomId + count 만 사용 — 메시지 본문/개인정보 미저장
// ────────────────────────────────────────────────────────────────────────────

/** provenance 가 보호하는 캐시 슬롯 (full = lite/full cache, critical = critical cache). */
export type CmWarmNetworkProvenanceSlot = "full" | "critical";
/** 실제 네트워크 응답의 tier. critical 은 seedComplete 근거가 될 수 없다. */
export type CmWarmNetworkProvenanceTier = "critical" | "lite" | "full";

export type CmWarmNetworkProvenance = {
  source: "actual_network";
  tier: CmWarmNetworkProvenanceTier;
  gateVersion: number;
  payloadFingerprint: string;
  roomIdsFingerprint: string;
  createdAt: number;
  consumed: boolean;
};

type WarmProvenanceRoomLike = { id?: string | null; room_id?: string | null };

const warmNetworkProvenance = new Map<CmWarmNetworkProvenanceSlot, CmWarmNetworkProvenance>();

function normalizeWarmRoomId(room: WarmProvenanceRoomLike | null | undefined): string {
  const raw = room?.id ?? room?.room_id ?? "";
  return String(raw).trim().toLowerCase();
}

/** 정렬·정규화된 roomId fingerprint (순서 차이로 오판하지 않게). 개인정보/메시지 미포함. */
export function cmWarmNetworkRoomIdsFingerprint(
  rooms: readonly WarmProvenanceRoomLike[] | null | undefined
): string {
  const ids = (rooms ?? [])
    .map((r) => normalizeWarmRoomId(r))
    .filter((id) => id.length > 0)
    .sort();
  return `${ids.length}:${ids.join(",")}`;
}

/** payload fingerprint — room 수 + roomId fingerprint (stable metadata only). */
export function cmWarmNetworkPayloadFingerprint(
  rooms: readonly WarmProvenanceRoomLike[] | null | undefined
): string {
  const roomIdsFp = cmWarmNetworkRoomIdsFingerprint(rooms);
  const count = (rooms ?? []).length;
  return `${count}#${roomIdsFp}`;
}

/** 동일 slot 의 기존 provenance 제거 (non-network prime·kill·clear 시). */
export function clearWarmNetworkProvenance(slot: CmWarmNetworkProvenanceSlot): void {
  warmNetworkProvenance.delete(slot);
}

/**
 * 실제 Warm Network 응답에서만 provenance 기록. 반드시 prime 이후 호출한다
 * (prime 이 동일 slot 의 stale provenance 를 먼저 clear 하므로).
 */
export function recordWarmNetworkProvenance(
  slot: CmWarmNetworkProvenanceSlot,
  args: {
    tier: CmWarmNetworkProvenanceTier;
    gateVersion: number;
    payloadFingerprint: string;
    roomIdsFingerprint: string;
  }
): void {
  warmNetworkProvenance.set(slot, {
    source: "actual_network",
    tier: args.tier,
    gateVersion: args.gateVersion,
    payloadFingerprint: args.payloadFingerprint,
    roomIdsFingerprint: args.roomIdsFingerprint,
    createdAt: Date.now(),
    consumed: false,
  });
}

/** 관측/테스트 전용 — 소비하지 않고 현재 provenance 만 확인. */
export function peekWarmNetworkProvenance(
  slot: CmWarmNetworkProvenanceSlot
): CmWarmNetworkProvenance | null {
  return warmNetworkProvenance.get(slot) ?? null;
}

/**
 * one-shot 소비. 모든 검증을 통과할 때만 provenance 를 반환하고 즉시 삭제한다.
 *  - kill/LEGACY·dispatch 비-shadow·gateVersion 불일치·이미 소비·비-network → stale 로 삭제 후 null.
 *  - fingerprint 불일치 → 삭제하지 않고 null (유효 payload 소비 여지 유지, 재소비는 여전히 gate/version 로 차단).
 */
export function consumeWarmNetworkProvenance(
  slot: CmWarmNetworkProvenanceSlot,
  expected: {
    gateVersion: number;
    kill: boolean;
    dispatch: string;
    wantsCanonicalRead: boolean;
    payloadFingerprint: string;
    roomIdsFingerprint: string;
  }
): CmWarmNetworkProvenance | null {
  const prov = warmNetworkProvenance.get(slot);
  if (!prov) return null;
  if (prov.consumed || prov.source !== "actual_network") {
    warmNetworkProvenance.delete(slot);
    return null;
  }
  // Kill/LEGACY gate → pending provenance 사용 금지 (stale 로 삭제).
  if (expected.kill || expected.dispatch !== "shadow" || !expected.wantsCanonicalRead) {
    warmNetworkProvenance.delete(slot);
    return null;
  }
  // gateVersion 단조 — 낮은/다른 version provenance 로 승격 금지 (stale 로 삭제).
  if (prov.gateVersion !== expected.gateVersion) {
    warmNetworkProvenance.delete(slot);
    return null;
  }
  // payload 동일성 — 불일치 시 삭제하지 않고 거부.
  if (
    prov.payloadFingerprint !== expected.payloadFingerprint ||
    prov.roomIdsFingerprint !== expected.roomIdsFingerprint
  ) {
    return null;
  }
  prov.consumed = true;
  warmNetworkProvenance.delete(slot); // one-shot
  return prov;
}

/** 테스트 전용 — 모든 slot provenance 초기화. */
export function resetWarmNetworkProvenanceForTests(): void {
  warmNetworkProvenance.clear();
}

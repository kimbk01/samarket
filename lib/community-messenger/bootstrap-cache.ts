import type { CommunityMessengerBootstrap, CommunityMessengerBootstrapCritical } from "@/lib/community-messenger/types";

const TTL_MS = 5 * 60 * 1000;
const SS_KEY_FULL = "samarket.messenger.bootstrap.v1";
const SS_KEY_CRITICAL = "samarket.messenger.bootstrap.critical.v1";
/** lite 네트워크 단축과 동일 페이로드 형태 — 별도 TTL 로 세션 복원 우선순위 조정 가능 */
const SS_KEY_MINIMAL = "samarket.messenger.bootstrap.minimal.v1";

let memoryFullCache: { data: CommunityMessengerBootstrap; at: number } | null = null;
let memoryCriticalCache: { data: CommunityMessengerBootstrapCritical; at: number } | null = null;
let memoryMinimalCache: { data: CommunityMessengerBootstrap; at: number } | null = null;

function readSessionFull(): CommunityMessengerBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_FULL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrap };
    if (!parsed.data) return null;
    memoryFullCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

function readSessionCritical(): CommunityMessengerBootstrapCritical | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_CRITICAL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrapCritical };
    if (!parsed?.data || parsed.data.tier !== "critical") return null;
    memoryCriticalCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

function readSessionMinimal(): CommunityMessengerBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_MINIMAL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrap };
    if (!parsed.data) return null;
    memoryMinimalCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

/** SPA 재진입·새로고침 직후 첫 페인트용 full 부트스트랩(stale 포함 — SWR 즉시 렌더). */
export function peekMessengerBootstrapFull(): CommunityMessengerBootstrap | null {
  if (memoryFullCache) {
    return memoryFullCache.data;
  }
  return readSessionFull();
}

/** critical 전용 스냅샷 — full 없이도 목록 즉시 표시용 */
export function peekMessengerBootstrapCritical(): CommunityMessengerBootstrapCritical | null {
  if (memoryCriticalCache) {
    return memoryCriticalCache.data;
  }
  return readSessionCritical();
}

/** deferred lite 응답 캐시(형태는 full 과 동일). */
export function peekMessengerBootstrapMinimal(): CommunityMessengerBootstrap | null {
  if (memoryMinimalCache) {
    return memoryMinimalCache.data;
  }
  return readSessionMinimal();
}

/** @deprecated peekMessengerBootstrapFull 와 동일 — 호환 유지 */
export function peekBootstrapCache(): CommunityMessengerBootstrap | null {
  return peekMessengerBootstrapFull();
}

export function isBootstrapCacheFresh(): boolean {
  if (memoryFullCache) return Date.now() - memoryFullCache.at <= TTL_MS;
  return false;
}

export function isCriticalBootstrapCacheFresh(): boolean {
  if (memoryCriticalCache) return Date.now() - memoryCriticalCache.at <= TTL_MS;
  return false;
}

export function primeMessengerBootstrapFull(data: CommunityMessengerBootstrap) {
  // 기본 prime 은 non-network 경로로 간주 — 동일 slot 의 stale provenance 를 먼저 제거한다.
  // 실제 Warm Network 경로는 prime 직후 recordWarmNetworkProvenance("full", …) 로 다시 기록한다.
  clearWarmNetworkProvenance("full");
  const tiered = { ...data, clientHydrationTier: "full" as const };
  memoryFullCache = { data: tiered, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_FULL, JSON.stringify({ at: Date.now(), data: tiered }));
  } catch {
    // ignore quota / private mode
  }
}

export function primeMessengerBootstrapCritical(data: CommunityMessengerBootstrapCritical) {
  clearWarmNetworkProvenance("critical");
  memoryCriticalCache = { data, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_CRITICAL, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore
  }
}

export function primeMessengerBootstrapMinimal(data: CommunityMessengerBootstrap) {
  memoryMinimalCache = { data, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_MINIMAL, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore
  }
}

/** @deprecated primeMessengerBootstrapFull 와 동일 */
export function primeBootstrapCache(data: CommunityMessengerBootstrap) {
  primeMessengerBootstrapFull(data);
}

export function clearBootstrapCache() {
  memoryFullCache = null;
  memoryCriticalCache = null;
  memoryMinimalCache = null;
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

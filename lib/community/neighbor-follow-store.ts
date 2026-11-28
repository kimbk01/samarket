"use client";

/**
 * 관심이웃 화면 상태 저장소 — 대상(회원)별 한 값 (설계 A · 감사 E1).
 * 글 상세 안내·⋯ 메뉴·공개 프로필·내정보 관리가 모두 이 값을 구독한다 → 한쪽에서 바꾸면 다른 쪽도 즉시 같은 값.
 * 서버는 상태 지정(`POST {targetUserId, following}`)이라 화면 값이 잠깐 낡아도 반대 동작이 되지 않는다.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  fetchCommunityUserRelationSnapshot,
  invalidateCommunityUserRelationSnapshot,
} from "@/lib/community/user-relation-client";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { forgetMypageListCache } from "@/lib/mypage/use-mypage-cursor-list";
import { NEIGHBOR_FOLLOW_PEOPLE_CACHE_PREFIX } from "@/lib/community/neighbor-follow-contract";

export type NeighborRelationState = {
  /** null = 아직 모름 */
  following: boolean | null;
  /** 내가 상대를 차단했는지 (null = 모름) */
  blocked: boolean | null;
  busy: boolean;
};

const EMPTY: NeighborRelationState = { following: null, blocked: null, busy: false };
const states = new Map<string, NeighborRelationState>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();
/** 대상별 변경 세대 — 추가·해제·차단 뒤에 끝난 이전 서버 읽기는 버린다(재감사 2) */
const versions = new Map<string, number>();
/** 이 저장소 값이 속한 로그인 회원 — 바뀌면 비운다(재감사 8: 계정 전환) */
let storeViewer: string | null = null;
/**
 * 계정 세대 — 회원이 바뀔 때만 +1(되돌리지 않음). 서버 읽기·저장은 시작 세대를 잡고, 끝났을 때 다르면 버린다
 * (감사 D6: 비울 때 versions 도 0 으로 돌아가 이전 계정 응답이 새 계정 저장소에 써지던 결함). 화면 구독은 이 값으로 다시 읽는다.
 */
let storeEpoch = 0;
const epochListeners = new Set<() => void>();
/** 구독자 없고 요청 중이 아닌 대상 값은 이 개수를 넘으면 오래된 순으로 정리(감사 L1) */
const MAX_TRACKED_TARGETS = 500;

function bump(k: string): void {
  versions.set(k, (versions.get(k) ?? 0) + 1);
}

/** 로그인 회원이 바뀌면 다른 회원의 관심이웃·차단 값을 보여 주지 않게 비운다 */
export function ensureNeighborStoreViewer(viewerId: string | null | undefined): void {
  const v = String(viewerId ?? "").trim() || null;
  if (v === storeViewer) return;
  const hadOwner = storeViewer !== null;
  storeViewer = v;
  storeEpoch += 1;
  if (hadOwner) {
    states.clear();
    loading.clear();
    versions.clear();
    for (const set of listeners.values()) for (const fn of set) fn();
  }
  for (const fn of epochListeners) fn();
}

function subscribeEpoch(fn: () => void): () => void {
  epochListeners.add(fn);
  return () => {
    epochListeners.delete(fn);
  };
}

function pruneUntracked(): void {
  if (states.size <= MAX_TRACKED_TARGETS) return;
  for (const k of states.keys()) {
    if (states.size <= MAX_TRACKED_TARGETS) break;
    if ((listeners.get(k)?.size ?? 0) > 0 || states.get(k)?.busy || loading.has(k)) continue;
    states.delete(k);
    versions.delete(k);
  }
}

function key(targetUserId: string): string {
  return targetUserId.trim();
}

function emit(k: string): void {
  for (const fn of listeners.get(k) ?? []) fn();
}

function patch(k: string, next: Partial<NeighborRelationState>): void {
  const prev = states.get(k) ?? EMPTY;
  const merged = { ...prev, ...next };
  if (merged.following === prev.following && merged.blocked === prev.blocked && merged.busy === prev.busy) return;
  /** 지웠다 다시 넣어 최근 순서로 — 정리는 가장 오래 안 바뀐 대상부터 */
  states.delete(k);
  states.set(k, merged);
  pruneUntracked();
  emit(k);
}

export function readNeighborRelation(targetUserId: string): NeighborRelationState {
  return states.get(key(targetUserId)) ?? EMPTY;
}

/**
 * 서버가 이미 알려 준 값(글 상세 `post.viewer`)으로 **모르는 칸만** 채운다.
 * 이미 아는 값(이 기기에서 방금 바꾼 값 등)은 덮지 않는다 — 캐시된 상세 데이터가 낡았을 수 있다.
 */
export function seedNeighborRelation(
  targetUserId: string,
  seed: { following?: boolean | null; blocked?: boolean | null },
): void {
  const k = key(targetUserId);
  if (!k) return;
  const cur = states.get(k) ?? EMPTY;
  if (cur.busy) return;
  patch(k, {
    ...(cur.following === null && typeof seed.following === "boolean" ? { following: seed.following } : {}),
    ...(cur.blocked === null && typeof seed.blocked === "boolean" ? { blocked: seed.blocked } : {}),
  });
}

/** 차단·차단 해제 결과 반영 — 차단하면 관심이웃도 서버에서 지워진다(`blockUserSocial`) */
export function applyBlockToNeighborRelation(targetUserId: string, blocked: boolean): void {
  const k = key(targetUserId);
  if (!k) return;
  invalidateCommunityUserRelationSnapshot(k);
  bump(k);
  patch(k, blocked ? { blocked: true, following: false } : { blocked: false });
  /** 차단하면 관심이웃 목록에서도 빠진다 — 내정보 관심이웃 사람 목록 캐시 무효화 */
  if (blocked) forgetMypageListCache(NEIGHBOR_FOLLOW_PEOPLE_CACHE_PREFIX);
}

async function loadFromServer(k: string): Promise<void> {
  if (loading.has(k)) return;
  loading.add(k);
  const startedAt = versions.get(k) ?? 0;
  const epochAt = storeEpoch;
  try {
    const rel = await fetchCommunityUserRelationSnapshot(k);
    /** 읽는 동안 회원이 바뀌었거나(계정 세대) 사용자가 바꿨으면(대상 세대) 낡은 값이라 버린다 */
    if (storeEpoch !== epochAt) return;
    if (states.get(k)?.busy || (versions.get(k) ?? 0) !== startedAt) return;
    patch(k, {
      ...(typeof rel.following === "boolean" ? { following: rel.following } : {}),
      ...(typeof rel.blocked === "boolean" ? { blocked: rel.blocked } : {}),
    });
  } finally {
    loading.delete(k);
  }
}

function subscribe(k: string, fn: () => void): () => void {
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    /** 빈 구독 목록은 지운다(감사 L1) */
    if (set && set.size === 0 && listeners.get(k) === set) listeners.delete(k);
  };
}

/**
 * 대상 회원의 관심이웃 상태 구독.
 * `seed` 가 있으면 그 값으로 시작하고 서버를 다시 읽지 않는다(상세 첫 데이터). 없고 모르면 1회 읽는다.
 */
export function useNeighborRelation(
  targetUserId: string | null | undefined,
  opts?: { enabled?: boolean; seed?: { following?: boolean | null; blocked?: boolean | null } },
): NeighborRelationState {
  const k = key(targetUserId ?? "");
  const enabled = opts?.enabled !== false && Boolean(k);
  const seedFollowing = opts?.seed?.following;
  const seedBlocked = opts?.seed?.blocked;
  const value = useSyncExternalStore(
    (fn) => (k ? subscribe(k, fn) : () => undefined),
    () => (k ? states.get(k) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
  /** 회원이 바뀌어 저장소를 비우면 다시 읽는다(감사 D6) */
  const epoch = useSyncExternalStore(subscribeEpoch, () => storeEpoch, () => 0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof seedFollowing === "boolean" || typeof seedBlocked === "boolean") {
      seedNeighborRelation(k, { following: seedFollowing, blocked: seedBlocked });
    }
    const cur = readNeighborRelation(k);
    if (cur.following === null || cur.blocked === null) void loadFromServer(k);
  }, [enabled, k, seedFollowing, seedBlocked, epoch]);

  return value;
}

export type SetNeighborFollowResult =
  | { ok: true; following: boolean }
  | { ok: false; error: string; status: number };

/**
 * 관심이웃 추가·해제 (상태 지정). 화면 값은 먼저 바꾸고, 실패하면 되돌린다.
 * 같은 대상에 요청 중이면 새 요청을 보내지 않는다.
 */
export async function setNeighborFollow(targetUserId: string, following: boolean): Promise<SetNeighborFollowResult> {
  const k = key(targetUserId);
  if (!k) return { ok: false, error: "bad_target", status: 400 };
  const prev = states.get(k) ?? EMPTY;
  if (prev.busy) return { ok: false, error: "busy", status: 409 };
  bump(k);
  patch(k, { busy: true, following });
  const epochAt = storeEpoch;
  try {
    const res = await fetch("/api/community/neighbor-relations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: k, following }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; following?: boolean; error?: string };
    invalidateCommunityUserRelationSnapshot(k);
    /** 요청 중 회원이 바뀌었으면 새 회원 저장소에 쓰지 않는다(감사 D6) */
    if (storeEpoch !== epochAt) return { ok: false, error: "stale_viewer", status: 0 };
    if (res.ok && j.ok && typeof j.following === "boolean") {
      patch(k, { busy: false, following: j.following });
      /** 내정보 › 라운지 › 관심이웃 「n명」 다시 셈 · 관심이웃 사람 목록 캐시 무효화 */
      invalidateMypageSummary();
      forgetMypageListCache(NEIGHBOR_FOLLOW_PEOPLE_CACHE_PREFIX);
      return { ok: true, following: j.following };
    }
    patch(k, {
      busy: false,
      following: prev.following,
      ...(j.error === "blocked_target" ? { following: false } : {}),
    });
    return { ok: false, error: String(j.error ?? "save_failed"), status: res.status };
  } catch {
    patch(k, { busy: false, following: prev.following });
    return { ok: false, error: "network", status: 0 };
  }
}

/** 시험용 — 저장소 비우기 */
export function __resetNeighborFollowStoreForTests(): void {
  states.clear();
  listeners.clear();
  loading.clear();
  versions.clear();
  storeViewer = null;
  storeEpoch = 0;
  epochListeners.clear();
}

/**
 * `/mypage` 홈 요약 값 — 클라이언트 단일 비행 + 재진입 스냅샷 (최종 설계 §2.2 클라이언트 훅).
 *
 * CONTRACT
 * - 홈 첫 페인트 **이후** 1회 단일 비행(`runSingleFlight("mypage:summary:"+viewerId)`).
 * - 캐시: 메모리 + `sessionStorage` `dibay:mypage-summary:<viewerId>`(10분). 진입 시 스냅샷 즉시 사용,
 *   30초 이상 지났으면 재검증. viewer 불일치·로그아웃·auth 변경 시 삭제.
 * - 실패는 실패로 남긴다 — 빈 값/0 으로 캐시하지 않는다.
 * - 홈 모델(`useMypageHomeModel`)과 분리(루트 네트워크 계약).
 */

import { runSingleFlight, forgetSingleFlight } from "@/lib/http/run-single-flight";
import type { MypageSummaryFields, MypageSummaryResponse } from "@/lib/mypage/mypage-summary-types";

export const MYPAGE_SUMMARY_ENDPOINT = "/api/me/mypage-summary";
export const MYPAGE_SUMMARY_SESSION_PREFIX = "dibay:mypage-summary:";
/** 세션 스냅샷 유효시간 */
export const MYPAGE_SUMMARY_SNAPSHOT_TTL_MS = 10 * 60_000;
/** 이 시간 안 재진입이면 재검증 생략 */
export const MYPAGE_SUMMARY_REVALIDATE_AFTER_MS = 30_000;

export type MypageHomeSummaryState = {
  viewerId: string;
  /** 마지막 성공 응답 필드 — 없으면 null */
  fields: MypageSummaryFields | null;
  fetchedAt: number;
  /** 첫 응답 대기 중(스냅샷 없음) */
  loading: boolean;
  /** 마지막 요청 실패(스냅샷 없으면 화면은 값 비움) */
  failed: boolean;
};

type Listener = () => void;

let state: MypageHomeSummaryState | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

function sessionKey(viewerId: string): string {
  return `${MYPAGE_SUMMARY_SESSION_PREFIX}${viewerId}`;
}

export function subscribeMypageHomeSummary(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMypageHomeSummaryState(): MypageHomeSummaryState | null {
  return state;
}

function readSessionSnapshot(viewerId: string, now: number): { fields: MypageSummaryFields; fetchedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(viewerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { viewerId?: string; fetchedAt?: number; fields?: MypageSummaryFields };
    if ((parsed.viewerId ?? "") !== viewerId || !parsed.fields) return null;
    const fetchedAt = Number(parsed.fetchedAt ?? 0);
    if (!Number.isFinite(fetchedAt) || now - fetchedAt > MYPAGE_SUMMARY_SNAPSHOT_TTL_MS) {
      window.sessionStorage.removeItem(sessionKey(viewerId));
      return null;
    }
    return { fields: parsed.fields, fetchedAt };
  } catch {
    return null;
  }
}

function writeSessionSnapshot(viewerId: string, fields: MypageSummaryFields, fetchedAt: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(sessionKey(viewerId), JSON.stringify({ viewerId, fetchedAt, fields }));
  } catch {
    /* quota/private */
  }
}

function removeAllSessionSnapshots(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(MYPAGE_SUMMARY_SESSION_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * 동기 시드 — 첫 렌더에 스냅샷 값을 쓰기 위해 렌더 전에 호출(네트워크 없음).
 * viewer 가 바뀌면 이전 viewer 의 값을 버린다.
 */
export function seedMypageHomeSummary(viewerId: string, now = Date.now()): MypageHomeSummaryState | null {
  const uid = viewerId.trim();
  // 서버 렌더에서는 모듈 상태를 만들지 않는다(요청 간 공유 방지)
  if (!uid || typeof window === "undefined") return null;
  if (state?.viewerId === uid) return state;
  const snap = readSessionSnapshot(uid, now);
  state = snap
    ? { viewerId: uid, fields: snap.fields, fetchedAt: snap.fetchedAt, loading: false, failed: false }
    : { viewerId: uid, fields: null, fetchedAt: 0, loading: true, failed: false };
  return state;
}

/** 재검증이 필요한가 — 실패 상태이거나 값이 없거나 30초 이상 지남 */
export function shouldRevalidateMypageHomeSummary(viewerId: string, now = Date.now()): boolean {
  const s = state;
  if (!s || s.viewerId !== viewerId.trim()) return true;
  if (s.failed || !s.fields) return true;
  return now - s.fetchedAt >= MYPAGE_SUMMARY_REVALIDATE_AFTER_MS;
}

async function requestSummary(viewerId: string): Promise<MypageSummaryFields | null> {
  try {
    const res = await fetch(MYPAGE_SUMMARY_ENDPOINT, { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as MypageSummaryResponse | null;
    if (!json || json.ok !== true || !json.fields) return null;
    if ((json.viewerId ?? "").trim() !== viewerId) return null;
    return json.fields;
  } catch {
    return null;
  }
}

/**
 * 요약 1회 조회(단일 비행). `force` 가 아니면 30초 안 재진입은 생략.
 * 응답이 도착했을 때 viewer 가 바뀌었으면 버린다.
 */
export async function loadMypageHomeSummary(
  viewerId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const uid = viewerId.trim();
  if (!uid) return;
  seedMypageHomeSummary(uid);
  if (!opts.force && !shouldRevalidateMypageHomeSummary(uid)) return;

  await runSingleFlight(`mypage:summary:${uid}`, async () => {
    const fields = await requestSummary(uid);
    if (!state || state.viewerId !== uid) return;
    if (fields) {
      const fetchedAt = Date.now();
      state = { viewerId: uid, fields, fetchedAt, loading: false, failed: false };
      writeSessionSnapshot(uid, fields, fetchedAt);
    } else {
      // 실패 — 기존 스냅샷 값은 유지(조용한 재검증 실패), 없으면 값 비움. 0 으로 채우지 않는다.
      state = { ...state, loading: false, failed: true };
    }
    emit();
  });
}

/**
 * 하위 화면 쓰기 성공 후 호출 — 캐시를 낡음 처리하고 다음 홈 진입(또는 마운트 중이면 즉시) 재조회.
 * 값은 지우지 않는다(재검증 동안 직전 값 유지).
 */
export function invalidateMypageSummary(): void {
  if (state) {
    state = { ...state, fetchedAt: 0 };
    forgetSingleFlight(`mypage:summary:${state.viewerId}`);
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MYPAGE_SUMMARY_INVALIDATED_EVENT));
    } catch {
      /* ignore */
    }
  }
}

export const MYPAGE_SUMMARY_INVALIDATED_EVENT = "dibay:mypage-summary-invalidated";

/** 로그아웃·계정 전환 — 메모리·세션 전부 삭제 */
export function clearMypageHomeSummary(): void {
  if (state) forgetSingleFlight(`mypage:summary:${state.viewerId}`);
  state = null;
  removeAllSessionSnapshots();
  emit();
}

/** 테스트 전용 */
export function __resetMypageHomeSummaryForTests(): void {
  state = null;
  listeners.clear();
}

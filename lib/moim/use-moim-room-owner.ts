"use client";

import { useEffect, useState } from "react";
import { registerAppResumeTask } from "@/lib/app-resume/app-resume-coordinator.client";
import type { MoimRole, MoimStatus } from "@/lib/moim/moim-permission-contract";

/**
 * 메신저 방이 모임 방인지 (GET /api/moim/rooms). 여러 방은 한 요청(100개씩)으로 묶는다.
 * 채팅 목록 핫 경로를 막지 않도록 화면이 그려진 뒤 조용히 채운다.
 *
 * 방별 상태 (모임 R5 A §2-2 · Owner 결정 1)
 * - none: 아직 묻지 않음 → 요청을 걸고 loading
 * - loading: 묻는 중 → 표면 규칙 pending(메신저 관리 UI 숨김)
 * - failed: 실패 → pending(숨김). 판정 끝이 아니다. 다음 표시(구독·방 열기·앱 복귀) 때 다시 묻는다(실패 뒤 30초 안에는 묻지 않음)
 * - resolved: 답 받음. 다시 묻는 동안에도 예전 값을 계속 보여 준다
 * 다시 묻는 때: 방 열기(답이 60초보다 오래됐을 때) · 앱 복귀(60초 이상 숨김, 구독 중인 방만) · 내 모임 쓰기 뒤(구독 중인 방만) ·
 * 로그아웃·계정 전환 = 전부 비움. 타이머로 되풀이하지 않는다.
 */
export type MoimRoomOwner = {
  moimId: string;
  kind: "moim" | "schedule";
  moimName: string;
  scheduleId?: string;
  /** 모임 상태 (모임 R4 D-3). 모임 행을 못 찾으면 null */
  moimStatus?: MoimStatus | null;
  /** 「모임 홈」·「일정 보기」·「모임 공지」가 열리는가 — 삭제·열람 끝·모임 행 없음 = false (모임 R5 A9) */
  homeOpen?: boolean;
  /** 읽기 전용 이유 — 앞쪽 우선 (모임 R5 A16) */
  readonlyReason?: MoimRoomReadonlyReason | null;
  /** 일정 방 시작 시각 (모임 R5 A24) */
  scheduleStartsAt?: string | null;
  /** 방 멤버 user_id → 모임 역할(모임장·부모임장·운영진만 · 모임 R4 #18). 일반 멤버는 없음 */
  memberRoles?: Record<string, Exclude<MoimRole, "member">>;
  /** 보는 사람이 모임 권한 start_dm 을 가졌는가 — 멤버 시트 [1:1 대화] (모임 R4 §5(b)③ · D-45) */
  canStartDm?: boolean;
};

export type MoimRoomReadonlyReason = "moim_deleted" | "moim_blocked" | "moim_closed" | "schedule_cancelled" | "schedule_done";

export type MoimRoomOwnerStatus = "none" | "loading" | "failed" | "resolved";

/** 「모임 홈」(일정 방은 「일정 보기」) 진입점을 보일까 — 서버 `homeOpen` 만 본다 (삭제·열람 끝·모임 행 없음 = 숨김 · 모임 R5 A9) */
export function moimRoomOwnerShowsHome(owner: MoimRoomOwner | null | undefined): owner is MoimRoomOwner {
  return Boolean(owner) && owner!.homeOpen === true;
}

/** 모임 방 이름 옆 역할 표시 키 (「· 운영진」) — 일반 멤버·모임 방이 아니면 null (모임 R4 #18) */
export function moimRoomMemberRoleKey(
  owner: MoimRoomOwner | null | undefined,
  userId: string | null | undefined
): "moim_role_host" | "moim_role_co_host" | "moim_role_staff" | null {
  if (!owner || !userId) return null;
  const role = owner.memberRoles?.[userId];
  if (role === "host") return "moim_role_host";
  if (role === "co_host") return "moim_role_co_host";
  if (role === "staff") return "moim_role_staff";
  return null;
}

/** 모임 방 → 모임 홈 · 일정 방 → 일정 상세 (메신저 머리글·메뉴·방 정보 공용 · 4번 묶음 D2) */
export function moimRoomOwnerHref(owner: MoimRoomOwner): string {
  return owner.kind === "schedule" && owner.scheduleId ? `/moim/${owner.moimId}/schedules/${owner.scheduleId}` : `/moim/${owner.moimId}`;
}

/** 실패 뒤 다시 묻지 않는 시간 — 목록 행은 스크롤로 마운트가 잦다 */
export const MOIM_ROOM_OWNER_RETRY_FLOOR_MS = 30_000;
/** 방을 열 때 다시 묻는 기준 — 마지막 답이 이보다 오래됐을 때만 */
export const MOIM_ROOM_OWNER_OPEN_MAX_AGE_MS = 60_000;
/** 앱 복귀 때 다시 묻는 숨김 시간 */
export const MOIM_ROOM_OWNER_RESUME_MIN_HIDDEN_MS = 60_000;
export const MOIM_ROOM_OWNER_RESUME_TASK_ID = "moim-room-owner-revalidate";

type Entry = {
  status: "loading" | "failed" | "resolved";
  owner: MoimRoomOwner | null;
  /** 마지막 답을 받은 시각 (resolved) */
  fetchedAt: number;
  /** 마지막 실패 시각 — 30초 하한 */
  failedAt: number;
  /** 모임 쓰기 뒤 「오래됨」 */
  stale: boolean;
};

const entries = new Map<string, Entry>();
/** 지금 화면이 구독 중인 방 → 구독 수 (앱 복귀·모임 쓰기 뒤 다시 묻는 대상) */
const subscribed = new Map<string, number>();
const listeners = new Set<() => void>();
let pending = new Set<string>();
/** 응답을 기다리는 방 — 그 사이 같은 방을 다시 요청하지 않는다 (감사 E8) */
const inFlight = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** 로그아웃·계정 전환마다 올린다 — 그 전에 나간 요청의 답은 버린다 */
let authEpoch = 0;
let resumeTaskRegistered = false;

function notify() {
  listeners.forEach((l) => l());
}

function flush() {
  timer = null;
  const ids = [...pending].filter((id) => !inFlight.has(id));
  pending = new Set();
  const epoch = authEpoch;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (const id of chunk) inFlight.add(id);
    const settle = (data: { ok?: boolean; owners?: Record<string, MoimRoomOwner> } | null) => {
      if (epoch !== authEpoch) return;
      const now = Date.now();
      for (const id of chunk) {
        inFlight.delete(id);
        const prev = entries.get(id);
        if (data?.ok) {
          entries.set(id, { status: "resolved", owner: data.owners?.[id] ?? null, fetchedAt: now, failedAt: 0, stale: false });
        } else if (prev?.status === "resolved") {
          /** 다시 묻기 실패 — 예전 답을 그대로 보여 주고, 다음 표시 때 다시 묻는다 */
          entries.set(id, { ...prev, failedAt: now });
        } else {
          entries.set(id, { status: "failed", owner: null, fetchedAt: 0, failedAt: now, stale: false });
        }
      }
      notify();
    };
    void fetch(`/api/moim/rooms?ids=${chunk.join(",")}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(settle, () => settle(null));
  }
}

type RequestOptions = {
  /** resolved 인 방도 답이 이 시간보다 오래됐으면 다시 묻는다 */
  maxAgeMs?: number;
};

function needsRequest(id: string, opts: RequestOptions, now: number): boolean {
  if (!id || pending.has(id) || inFlight.has(id)) return false;
  const e = entries.get(id);
  if (!e) return true;
  if (e.failedAt && now - e.failedAt < MOIM_ROOM_OWNER_RETRY_FLOOR_MS) return false;
  if (e.status === "failed") return true;
  if (e.status === "loading") return false;
  if (e.stale) return true;
  return opts.maxAgeMs != null && now - e.fetchedAt > opts.maxAgeMs;
}

/** 방들을 모아 120ms 뒤 한 번에 묻는다 (훅이 부름 · 시험용으로도 내보냄) */
export function requestMoimRoomOwners(ids: readonly string[], opts: RequestOptions = {}) {
  const now = Date.now();
  let added = false;
  let changed = false;
  for (const id of ids) {
    if (!needsRequest(id, opts, now)) continue;
    pending.add(id);
    added = true;
    const e = entries.get(id);
    if (!e || e.status === "failed") {
      entries.set(id, { status: "loading", owner: null, fetchedAt: 0, failedAt: e?.failedAt ?? 0, stale: false });
      changed = true;
    }
  }
  if (added && !timer) timer = setTimeout(flush, 120);
  if (changed) notify();
}

/** 방을 열 때 — 마지막 답이 60초보다 오래됐을 때만 그 방 1개를 다시 묻는다 (예전 값은 그대로 보임) */
export function revalidateMoimRoomOwner(roomId: string | null | undefined) {
  if (!roomId) return;
  requestMoimRoomOwners([roomId], { maxAgeMs: MOIM_ROOM_OWNER_OPEN_MAX_AGE_MS });
}

/** 내가 모임에서 무엇을 바꾼 뒤 — 캐시 전부를 「오래됨」으로 표시하고 구독 중인 방만 다시 묻는다 (`moim-client-api.ts` 쓰기 경로) */
export function markMoimRoomOwnersStale() {
  for (const e of entries.values()) if (e.status === "resolved") e.stale = true;
  requestMoimRoomOwners([...subscribed.keys()]);
}

/** 앱 복귀(60초 이상 숨김) — 구독 중인 방을 한 요청으로 다시 묻는다 */
export function revalidateSubscribedMoimRoomOwners() {
  requestMoimRoomOwners([...subscribed.keys()], { maxAgeMs: 0 });
}

/** 로그아웃·계정 전환 — 캐시·실패·대기 전부 비움 (`lib/auth/client-session-wipe.ts`) */
export function clearMoimRoomOwnerCacheForAuthChange() {
  authEpoch += 1;
  entries.clear();
  inFlight.clear();
  pending = new Set();
  if (timer) clearTimeout(timer);
  timer = null;
  notify();
  /** 이미 그려진 방·목록 행은 키가 그대로라 다시 묻지 않는다 — 비운 뒤 구독 중인 방을 새 계정으로 다시 묻는다(R5 재감사) */
  const epoch = authEpoch;
  setTimeout(() => {
    if (epoch !== authEpoch || subscribed.size === 0) return;
    requestMoimRoomOwners([...subscribed.keys()]);
  }, 0);
}

function ensureResumeTask() {
  if (resumeTaskRegistered) return;
  resumeTaskRegistered = true;
  registerAppResumeTask({
    id: MOIM_ROOM_OWNER_RESUME_TASK_ID,
    lane: "background",
    auth: "required",
    minHiddenMs: MOIM_ROOM_OWNER_RESUME_MIN_HIDDEN_MS,
    run: () => revalidateSubscribedMoimRoomOwners(),
  });
}

function subscribe(ids: readonly string[]) {
  for (const id of ids) subscribed.set(id, (subscribed.get(id) ?? 0) + 1);
}

function unsubscribe(ids: readonly string[]) {
  for (const id of ids) {
    const n = (subscribed.get(id) ?? 0) - 1;
    if (n > 0) subscribed.set(id, n);
    else subscribed.delete(id);
  }
}

export function peekMoimRoomOwner(roomId: string | null | undefined): MoimRoomOwner | null {
  return roomId ? entries.get(roomId)?.owner ?? null : null;
}

/** 방의 판정 상태 (훅 밖 — 입력창 Pass1·알림 배너) */
export function peekMoimRoomOwnerState(roomId: string | null | undefined): { owner: MoimRoomOwner | null; status: MoimRoomOwnerStatus } {
  if (!roomId) return { owner: null, status: "none" };
  const e = entries.get(roomId);
  if (!e) return { owner: null, status: "none" };
  return { owner: e.owner, status: e.status };
}

/**
 * 모임 방 판정이 끝났는가 — 답을 받았을 때만 true (모임 R5 결정 1: 실패는 판정 끝이 아니다).
 * roomId 가 없으면 true(모임 방 아님).
 */
export function peekMoimRoomOwnerResolved(roomId: string | null | undefined): boolean {
  if (!roomId) return true;
  return entries.get(roomId)?.status === "resolved";
}

function useSubscribedRooms(roomIds: readonly string[]) {
  const [, setTick] = useState(0);
  const key = roomIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    subscribe(ids);
    ensureResumeTask();
    requestMoimRoomOwners(ids);
    return () => {
      listeners.delete(l);
      unsubscribe(ids);
    };
  }, [key]);
}

export function useMoimRoomOwners(roomIds: readonly string[]): Record<string, MoimRoomOwner> {
  useSubscribedRooms(roomIds);
  const out: Record<string, MoimRoomOwner> = {};
  for (const id of roomIds) {
    const v = entries.get(id)?.owner;
    if (v) out[id] = v;
  }
  return out;
}

export function useMoimRoomOwner(roomId: string | null | undefined): MoimRoomOwner | null {
  const owners = useMoimRoomOwners(roomId ? [roomId] : []);
  return roomId ? owners[roomId] ?? null : null;
}

/** 소유 모임 + 판정 상태 (roomId 가 없으면 status none · resolved true = 모임 방 아님) */
export function useMoimRoomOwnerState(roomId: string | null | undefined): {
  owner: MoimRoomOwner | null;
  status: MoimRoomOwnerStatus;
  resolved: boolean;
} {
  useSubscribedRooms(roomId ? [roomId] : []);
  const { owner, status } = peekMoimRoomOwnerState(roomId);
  return { owner, status, resolved: peekMoimRoomOwnerResolved(roomId) };
}

/** 시험용 — 모듈 캐시 비우기 */
export function __resetMoimRoomOwnerCacheForTests() {
  clearMoimRoomOwnerCacheForAuthChange();
  subscribed.clear();
  listeners.clear();
  resumeTaskRegistered = false;
}

/** 시험용 — 구독 흉내 */
export function __subscribeMoimRoomOwnersForTests(ids: readonly string[]): () => void {
  subscribe(ids);
  return () => unsubscribe(ids);
}

/** 시험용 — 복귀 작업 등록 흉내 */
export function __ensureMoimRoomOwnerResumeTaskForTests() {
  ensureResumeTask();
}

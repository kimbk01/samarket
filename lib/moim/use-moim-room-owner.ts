"use client";

import { useEffect, useState } from "react";
import type { MoimRole, MoimStatus } from "@/lib/moim/moim-permission-contract";

/**
 * 메신저 방이 모임 방인지 (GET /api/moim/rooms). 세션 동안 방별로 한 번만 묻고(없음도 기억), 여러 방은 한 요청으로 묶는다.
 * 채팅 목록 핫 경로를 막지 않도록 화면이 그려진 뒤 조용히 채운다.
 */
export type MoimRoomOwner = {
  moimId: string;
  kind: "moim" | "schedule";
  moimName: string;
  scheduleId?: string;
  /** 모임 상태 — 어드민이 삭제한 모임이면 「모임 홈」 진입점만 숨긴다 (모임 R4 D-3). 옛 응답이면 없음 */
  moimStatus?: MoimStatus | null;
  /** 방 멤버 user_id → 모임 역할(모임장·부모임장·운영진만 · 모임 R4 #18). 일반 멤버는 없음 */
  memberRoles?: Record<string, Exclude<MoimRole, "member">>;
  /** 보는 사람이 모임 권한 start_dm 을 가졌는가 — 멤버 시트 [1:1 대화] (모임 R4 §5(b)③ · D-45) */
  canStartDm?: boolean;
};

/** 「모임 홈」(일정 방은 「일정 보기」) 진입점을 보일까 — 삭제된 모임이면 빈 화면이라 숨긴다 (모임 R4 D-3 · 모임 방 판정은 그대로) */
export function moimRoomOwnerShowsHome(owner: MoimRoomOwner | null | undefined): owner is MoimRoomOwner {
  return Boolean(owner) && owner!.moimStatus !== "deleted";
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

const cache = new Map<string, MoimRoomOwner | null>();
/** 판정 요청이 실패한 방 — 판정 중(unknown)으로 두지 않고 「모임 방 아님」처럼 메뉴를 보인다 (모임 R4 #14 · 다음 표시 때 다시 묻는다) */
const failed = new Set<string>();
const listeners = new Set<() => void>();
let pending = new Set<string>();
/** 응답을 기다리는 방 — 그 사이 같은 방을 다시 요청하지 않는다 (감사 E8). 실패하면 빼서 다음 표시 때 다시 묻는다 */
const inFlight = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const ids = [...pending].filter((id) => !cache.has(id) && !inFlight.has(id));
  pending = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (const id of chunk) inFlight.add(id);
    void fetch(`/api/moim/rooms?ids=${chunk.join(",")}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; owners?: Record<string, MoimRoomOwner> } | null) => {
        if (!data?.ok) {
          for (const id of chunk) failed.add(id);
          listeners.forEach((l) => l());
          return;
        }
        for (const id of chunk) {
          failed.delete(id);
          cache.set(id, data.owners?.[id] ?? null);
        }
        listeners.forEach((l) => l());
      })
      .catch(() => {
        for (const id of chunk) failed.add(id);
        listeners.forEach((l) => l());
      })
      .finally(() => {
        for (const id of chunk) inFlight.delete(id);
      });
  }
}

/** 방들을 모아 120ms 뒤 한 번에 묻는다 (훅이 부름 · 시험용으로도 내보냄) */
export function requestMoimRoomOwners(ids: string[]) {
  let added = false;
  for (const id of ids) {
    if (id && !cache.has(id) && !pending.has(id) && !inFlight.has(id)) {
      pending.add(id);
      added = true;
    }
  }
  if (added && !timer) timer = setTimeout(flush, 120);
}

export function peekMoimRoomOwner(roomId: string | null | undefined): MoimRoomOwner | null {
  return roomId ? cache.get(roomId) ?? null : null;
}

/**
 * 모임 방 판정이 끝났는가 (모임 R4 #14). false = 판정 중(unknown) — 비공개 그룹방은 모임 방일 수 있어
 * 메신저 운영·나가기·초대 메뉴를 그동안 숨긴다. 요청이 실패하면 true(메뉴 보임 · 예전 동작).
 */
export function peekMoimRoomOwnerResolved(roomId: string | null | undefined): boolean {
  if (!roomId) return true;
  return cache.has(roomId) || failed.has(roomId);
}

export function useMoimRoomOwners(roomIds: readonly string[]): Record<string, MoimRoomOwner> {
  const [, setTick] = useState(0);
  const key = roomIds.join(",");
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    requestMoimRoomOwners(key ? key.split(",") : []);
    return () => {
      listeners.delete(l);
    };
  }, [key]);
  const out: Record<string, MoimRoomOwner> = {};
  for (const id of roomIds) {
    const v = cache.get(id);
    if (v) out[id] = v;
  }
  return out;
}

export function useMoimRoomOwner(roomId: string | null | undefined): MoimRoomOwner | null {
  const owners = useMoimRoomOwners(roomId ? [roomId] : []);
  return roomId ? owners[roomId] ?? null : null;
}

/** 소유 모임 + 판정 끝 여부 (모임 R4 #14 · roomId 가 없으면 판정 끝 = 모임 방 아님) */
export function useMoimRoomOwnerState(roomId: string | null | undefined): { owner: MoimRoomOwner | null; resolved: boolean } {
  const owner = useMoimRoomOwner(roomId);
  return { owner, resolved: peekMoimRoomOwnerResolved(roomId) };
}

/** 시험용 — 모듈 캐시 비우기 */
export function __resetMoimRoomOwnerCacheForTests() {
  cache.clear();
  failed.clear();
  inFlight.clear();
  pending = new Set();
  if (timer) clearTimeout(timer);
  timer = null;
}

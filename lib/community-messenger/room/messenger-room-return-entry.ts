"use client";

/**
 * D4 (Owner 「D4 진행」 2026-11-09) — 메신저 방 「뒤로 돌아옴」 진입 판정.
 *
 * 앱 전체 위치 규칙(`lib/navigation/app-scroll-memory.ts` P1: 상세에서 뒤로 → 이전 화면 위치)을 방에도 적용한다.
 * 방은 위치를 스스로 정하므로(진입 정책 `resolveMessengerRoomEntryScrollPlan`) 앱 규칙의 방문 판정만 빌려 쓴다.
 *
 * - 방이 처음 그려질 때(메시지 목록 초기값을 정할 때) 1번 판정해 방 id 별로 기억한다.
 *   그 뒤 스크롤 진입 단계가 같은 값을 읽는다 — 두 곳의 판정이 어긋나지 않게.
 * - 주소가 아직 이 방이 아니면(목록에서 누른 직후 주소 반영 전 렌더) 「새 진입」으로 본다.
 */
import { appScrollKey, resolveAppScrollVisitForKey } from "@/lib/navigation/app-scroll-memory";

const ROOM_PATH_PREFIX = "/community-messenger/rooms/";
/** 판정 후 스크롤 진입 단계까지 걸릴 수 있는 시간(느린 첫 불러오기 포함) */
const DECISION_MAX_AGE_MS = 120_000;

const decisionByRoomId = new Map<string, { isReturn: boolean; at: number }>();

function currentRoomKey(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname || "";
  if (!path.startsWith(ROOM_PATH_PREFIX)) return null;
  let segment = path.slice(ROOM_PATH_PREFIX.length).split("/")[0] ?? "";
  try {
    segment = decodeURIComponent(segment);
  } catch {
    /* keep raw */
  }
  if (segment.trim() !== roomId.trim()) return null;
  return appScrollKey(path, window.location.search);
}

/** 방 첫 그림 때 1번 — 이번 진입이 「뒤로 돌아옴」인지 판정하고 기억한다. */
export function decideMessengerRoomReturnEntry(roomId: string, now = Date.now()): boolean {
  const id = roomId.trim();
  if (!id) return false;
  const prev = decisionByRoomId.get(id);
  /** 같은 진입 안에서 다시 그려져도(초기값 재계산) 판정을 바꾸지 않는다 */
  if (prev && now - prev.at <= 1_000) return prev.isReturn;
  const key = currentRoomKey(id);
  const isReturn = key != null && resolveAppScrollVisitForKey(key, window.history.length, now) === "return";
  decisionByRoomId.set(id, { isReturn, at: now });
  return isReturn;
}

/** 스크롤 진입 단계 — 이번 진입의 판정(없거나 오래됐으면 false). */
export function peekMessengerRoomReturnEntry(roomId: string, now = Date.now()): boolean {
  const row = decisionByRoomId.get(roomId.trim());
  if (!row) return false;
  if (now - row.at > DECISION_MAX_AGE_MS) return false;
  return row.isReturn;
}

/** 진입 처리가 끝나면 지운다 — 같은 방에 머무는 동안 다른 판정에 쓰이지 않게. */
export function clearMessengerRoomReturnEntry(roomId: string): void {
  decisionByRoomId.delete(roomId.trim());
}

export function __resetMessengerRoomReturnEntryForTest(): void {
  decisionByRoomId.clear();
}

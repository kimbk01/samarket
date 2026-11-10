"use client";

/**
 * 친구 행 「내 연락처」 표시 (정책 #5 · 시안 친구 행 lb ct) — 친구이면서 내 연락처(어느 기기든)에 있는 회원 id.
 * 연락처 목록 응답의 `friend_ids` 를 담아 두고 친구 탭이 읽는다 (친구 데이터 변경 없음 · 메신저 bootstrap 과 무관).
 */
import { useSyncExternalStore } from "react";

let ids: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function setContactsFriendTagIds(next: readonly string[]): void {
  if (next.length === ids.size && next.every((id) => ids.has(id))) return;
  ids = new Set(next);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useContactsFriendTagIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => ids,
    () => ids
  );
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * 거래 글 「이 글 숨기기」 — 화면 공통 저장소 (F1 · F2, Owner 2026-11-03).
 * 홈·카테고리·찜·최근 본·전역 검색이 같은 카드(`PostCard`)로 숨김을 읽고 쓴다 — 한 화면에서 숨기면 다른 화면에서도 가려진다.
 *
 * F2 서버 저장:
 * - 기기 저장 `dibay:trade-hidden-post-ids:v1` = { userId, ids } — 앱을 다시 열면 바로 가린다(깜빡임 없음).
 * - 처음 구독할 때 서버(`GET /api/my/hidden-posts`)에서 1회 읽어 **교체**(다른 기기에서 되돌린 글도 맞게) —
 *   읽는 동안 누른 숨기기·되돌리기는 교체 뒤 다시 적용. 계정이 다르면 기기 저장값을 버린다(서버 값으로 교체).
 * - 숨기기·되돌리기 = 화면 먼저 바꾸고 서버 저장(`PUT`/`DELETE /api/posts/[id]/hide`). 실패하면 화면을 원래대로.
 *   표가 아직 없으면(503) 이번 실행 동안 메모리로만 유지(되돌리지 않음).
 * - 비로그인(401) = 메모리만(기기·서버 저장 없음).
 * 로그아웃·계정 전환 때 기기 저장은 기존 세션 정리(`clearEphemeralLocalStorage`)가 지운다.
 */
const STORAGE_KEY = "dibay:trade-hidden-post-ids:v1";
const MAX_IDS = 500;
const listeners = new Set<() => void>();
const initialDevice = readDevice();
let hidden: ReadonlySet<string> = initialDevice.ids;
let ownerUserId: string | null = initialDevice.userId;
let serverSyncStarted = false;
let serverMode: "unknown" | "server" | "memory" = "unknown";
/** 서버 목록을 받기 전에 누른 동작 — 교체 뒤 다시 적용 */
let pendingOps: Array<{ id: string; hide: boolean }> = [];

function readDevice(): { userId: string | null; ids: ReadonlySet<string> } {
  try {
    if (typeof window === "undefined") return { userId: null, ids: new Set() };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { userId: null, ids: new Set() };
    const parsed = JSON.parse(raw) as { userId?: unknown; ids?: unknown };
    const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((v): v is string => typeof v === "string") : [];
    return { userId: typeof parsed.userId === "string" ? parsed.userId : null, ids: new Set(ids) };
  } catch {
    return { userId: null, ids: new Set() };
  }
}

function writeDevice(): void {
  if (!ownerUserId) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: ownerUserId, ids: [...hidden].slice(-MAX_IDS) }));
  } catch {
    /* 저장 실패해도 이번 실행 메모리에는 남는다 */
  }
}

function emit() {
  for (const l of listeners) l();
}

function apply(id: string, hide: boolean): boolean {
  if (hide === hidden.has(id)) return false;
  const next = new Set(hidden);
  if (hide) next.add(id);
  else next.delete(id);
  hidden = next;
  return true;
}

function syncFromServer(): void {
  if (serverSyncStarted || typeof window === "undefined") return;
  serverSyncStarted = true;
  void fetch("/api/my/hidden-posts", { credentials: "include", cache: "no-store" })
    .then(async (res) => {
      if (res.status === 401) {
        serverMode = "memory";
        return;
      }
      if (!res.ok) {
        serverSyncStarted = false;
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { userId?: unknown; postIds?: unknown; tableMissing?: boolean };
      if (data.tableMissing) {
        serverMode = "memory";
        return;
      }
      const ids = Array.isArray(data.postIds) ? data.postIds.filter((v): v is string => typeof v === "string") : [];
      serverMode = "server";
      ownerUserId = typeof data.userId === "string" ? data.userId : null;
      hidden = new Set(ids);
      for (const op of pendingOps) apply(op.id, op.hide);
      pendingOps = [];
      writeDevice();
      emit();
    })
    .catch(() => {
      serverSyncStarted = false;
    });
}

function subscribe(listener: () => void): () => void {
  syncFromServer();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function persist(id: string, hide: boolean): Promise<void> {
  if (serverMode === "memory") return;
  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(id)}/hide`, {
      method: hide ? "PUT" : "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      writeDevice();
      return;
    }
    /** 비로그인·표 없음 = 메모리로만(화면 유지) */
    if (res.status === 401 || res.status === 503) {
      serverMode = "memory";
      return;
    }
  } catch {
    /* 네트워크 실패 → 아래에서 되돌림 */
  }
  if (apply(id, !hide)) {
    writeDevice();
    emit();
  }
}

function change(postId: string, hide: boolean): void {
  const id = postId.trim();
  if (!id) return;
  if (!apply(id, hide)) return;
  if (serverMode === "unknown") pendingOps.push({ id, hide });
  emit();
  void persist(id, hide);
}

export function hideTradePost(postId: string): void {
  change(postId, true);
}

export function unhideTradePost(postId: string): void {
  change(postId, false);
}

/** 카드 1장 단위 구독 — 다른 글을 숨겨도 이 카드는 다시 그리지 않는다 */
export function useIsTradePostHidden(postId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden.has(postId),
    () => false
  );
}

/** 테스트 전용 */
export function resetTradeHiddenPostsStoreForTests(): void {
  hidden = new Set();
  ownerUserId = null;
  serverSyncStarted = false;
  serverMode = "unknown";
  pendingOps = [];
  listeners.clear();
}

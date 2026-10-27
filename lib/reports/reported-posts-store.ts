"use client";

import { useSyncExternalStore } from "react";

/**
 * P-2 (2026-10-27, Owner 승인 v3 · Marketplace 방식): 신고한 글은 **신고자 본인 목록에서** 자리 카드로 가려진다(행 제거 없음 — 목록 정렬·페이지 계약 유지).
 * 서버 숨김(관리자 처리)과 별개.
 * 거래 H RP-2 (2026-10-28): 처음 구독할 때 서버(`GET /api/my/reported-posts`, `reports` 테이블)에서 내가 신고한 글을 읽어 합친다
 * — 다른 기기에서 신고한 글도 가려진다. 기기 저장소는 방금 신고한 글을 바로 가리는 캐시로만 쓴다.
 */
const STORAGE_KEY = "dibay:reported-post-ids:v1";
const MAX_IDS = 500;
const listeners = new Set<() => void>();
let cache: ReadonlySet<string> | null = null;
const EMPTY: ReadonlySet<string> = new Set();

function read(): ReadonlySet<string> {
  if (cache) return cache;
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    cache = new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

export function markPostReportedByMe(postId: string): void {
  const id = postId.trim();
  if (!id) return;
  const next = [...read()].filter((v) => v !== id);
  next.push(id);
  const trimmed = next.slice(-MAX_IDS);
  cache = new Set(trimmed);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 저장 실패해도 이번 세션 메모리에는 남는다 */
  }
  for (const l of listeners) l();
}

let serverSyncStarted = false;

/** 로그인 회원만 응답(비로그인 401 은 무시). 한 번만 읽는다 — 이후 신고는 `markPostReportedByMe` 가 바로 더한다 */
function syncReportedPostIdsFromServer(): void {
  if (serverSyncStarted || typeof window === "undefined") return;
  serverSyncStarted = true;
  void fetch("/api/my/reported-posts", { credentials: "include", cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { postIds?: unknown };
      const ids = Array.isArray(data.postIds) ? data.postIds.filter((v): v is string => typeof v === "string") : [];
      if (ids.length === 0) return;
      const merged = new Set(read());
      let changed = false;
      for (const id of ids) {
        if (!merged.has(id)) {
          merged.add(id);
          changed = true;
        }
      }
      if (!changed) return;
      const trimmed = [...merged].slice(-MAX_IDS);
      cache = new Set(trimmed);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        /* 메모리에는 남는다 */
      }
      for (const l of listeners) l();
    })
    .catch(() => {
      /* 실패하면 기기 저장소 값만 쓴다 */
      serverSyncStarted = false;
    });
}

function subscribe(listener: () => void): () => void {
  syncReportedPostIdsFromServer();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReportedPostIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

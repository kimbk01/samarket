"use client";

import { useSyncExternalStore } from "react";

/**
 * P-2 (2026-10-27, Owner 승인 v3 · Marketplace 방식): 신고한 글은 **신고자 본인 목록에서** 바로 사라진다.
 * 서버 숨김(관리자 처리)과 별개 — 이 기기·이 계정 화면에만 적용되는 보조 필터.
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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReportedPostIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

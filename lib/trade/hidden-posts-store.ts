"use client";

import { useSyncExternalStore } from "react";

/**
 * 거래 글 「이 글 숨기기」 — 화면 공통 저장소 (F1, Owner 2026-11-03 「F1·F5 구현」).
 * 홈·카테고리·찜·최근 본·전역 검색이 같은 카드(`PostCard`)로 숨김을 읽고 쓴다 — 한 화면에서 숨기면 다른 화면에서도 가려진다.
 *
 * 지금은 앱을 켜 둔 동안만 유지한다(서버 저장 없음). 다시 열어도 남게 하는 서버 저장은 F2(테이블 `trade_post_user_hides`,
 * 운영 DB 적용 승인 필요)에서 이 파일에 붙인다 — 화면 코드는 바꾸지 않는다.
 */
const listeners = new Set<() => void>();
let hidden: ReadonlySet<string> = new Set();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hideTradePost(postId: string): void {
  const id = postId.trim();
  if (!id || hidden.has(id)) return;
  const next = new Set(hidden);
  next.add(id);
  hidden = next;
  emit();
}

export function unhideTradePost(postId: string): void {
  const id = postId.trim();
  if (!id || !hidden.has(id)) return;
  const next = new Set(hidden);
  next.delete(id);
  hidden = next;
  emit();
}

/** 카드 1장 단위 구독 — 다른 글을 숨겨도 이 카드는 다시 그리지 않는다 */
export function useIsTradePostHidden(postId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden.has(postId),
    () => false
  );
}

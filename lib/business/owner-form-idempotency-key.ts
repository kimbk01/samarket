"use client";

import { useCallback, useState } from "react";

/**
 * 4-0 (RC-11) — 오너 폼 고정 멱등 키.
 * 마운트 시 1회 생성하고, 서버 저장이 **성공했을 때만** `rotate()` 로 새 키를 만든다
 * (광고 `clientRequestId` 패턴). 실패·재시도는 같은 키 → 서버 UNIQUE 가 중복 생성을 막는다.
 */
export function newOwnerFormIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rand()}-${rand()}`;
}

export function useOwnerFormIdempotencyKey(): { key: string; rotate: () => void } {
  const [key, setKey] = useState<string>(() => newOwnerFormIdempotencyKey());
  const rotate = useCallback(() => setKey(newOwnerFormIdempotencyKey()), []);
  return { key, rotate };
}

"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Blob URL 주인 훅 (P0-D · Owner 4단계 D 2026-11-09).
 *
 * 계약:
 * - 이 훅을 쓰는 컴포넌트(이미지 목록 상태의 주인)만 자기 목록의 `blob:` URL 을 해제한다.
 * - 목록이 바뀌면 이전 목록에 있었고 새 목록에 없는 URL 만 해제(삭제·교체·업로드 후 https 교체·새로 작성·덮어쓰기 공통).
 * - 언마운트 시 남은 URL 해제. React StrictMode 의 가짜 언마운트로 해제되지 않도록 한 틱 미루고 재마운트면 취소.
 * - `borrowed`(다른 주인에게 빌린 URL — 예: 부모 시트가 넘긴 시드 사진)는 절대 해제하지 않는다.
 * - 반환 함수 `isOwnerMounted()` — 비동기 작업(업로드 응답 등) 뒤 새 blob URL 을 만들기 전에 확인한다.
 *   주인이 이미 언마운트됐으면 그 URL 은 목록에 들어가지 못해 아무도 해제하지 않으므로 만들지 않는다.
 *   StrictMode 가짜 언마운트·재마운트에서는 다시 true.
 * - 임시저장은 URL 이 아니라 File·localId·https 로 저장된다(`tradeWriteImagesToDraftRefs`) → 해제가 초안을 지우지 않는다.
 */
function blobUrls(urls: readonly (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const u of urls) if (typeof u === "string" && u.startsWith("blob:")) out.add(u);
  return out;
}

export function revokeBlobUrlsExcept(urls: Iterable<string>, borrowed?: ReadonlySet<string> | null): number {
  let n = 0;
  for (const u of urls) {
    if (!u.startsWith("blob:") || borrowed?.has(u)) continue;
    try {
      URL.revokeObjectURL(u);
      n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

export function useReleaseDroppedBlobUrls(
  urls: readonly (string | null | undefined)[],
  borrowed?: ReadonlySet<string> | null
): () => boolean {
  const prevRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const borrowedRef = useRef<ReadonlySet<string> | null | undefined>(borrowed);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    borrowedRef.current = borrowed;
  }, [borrowed]);

  const key = urls.filter((u): u is string => typeof u === "string" && u.startsWith("blob:")).join("\n");

  useEffect(() => {
    const next = blobUrls(key ? key.split("\n") : []);
    const dropped: string[] = [];
    for (const u of prevRef.current) if (!next.has(u)) dropped.push(u);
    revokeBlobUrlsExcept(dropped, borrowedRef.current);
    prevRef.current = next;
  }, [key]);

  useEffect(() => {
    mountedRef.current = true;
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      const remaining = [...prevRef.current];
      unmountTimerRef.current = setTimeout(() => {
        unmountTimerRef.current = null;
        revokeBlobUrlsExcept(remaining, borrowedRef.current);
        prevRef.current = new Set();
      }, 0);
    };
  }, []);

  return useCallback(() => mountedRef.current, []);
}

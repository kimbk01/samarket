"use client";

import { useEffect, useMemo, useRef } from "react";
import { revokeBlobUrlsExcept } from "@/lib/media/use-release-dropped-blob-urls";

/**
 * 거래 글쓰기 초안 사진 복원(비동기) 가드 — 일반 거래·일자리·환전 공용.
 *
 * `loadTradeWriteDraftImageItems` 는 기기 보관 사진마다 blob URL 을 새로 만든다. 그 결과가 목록(images)에
 * 들어가면 목록 주인 훅(`useReleaseDroppedBlobUrls`)이 해제하지만, 버려지는 결과의 URL 은 주인이 모른다.
 * 결과가 버려지는 경우:
 * - 복원 중 새 복원·초기화가 시작됨(`invalidate` / 다음 `begin`)
 * - 복원 중 화면이 닫힘(언마운트) — 이때 setImages 로 보내지 않고 URL 을 해제한다.
 *
 * 언마운트는 토큰 증가가 아니라 mounted 플래그로 판정한다: React StrictMode 의 가짜 언마운트·재마운트에서
 * 진행 중 복원이 취소되지 않게(재마운트 시 다시 true) — `useReleaseDroppedBlobUrls` 의 StrictMode 처리와 같은 목적.
 */
export type TradeWriteDraftPhotoRestoreGuard = {
  /** 새 복원 시작 — 이전 복원 결과는 버려진다. 반환 함수가 true 면 이 복원 결과를 적용해도 된다. */
  begin: () => () => boolean;
  /** 진행 중 복원 결과를 버린다(초기화·새로 작성). */
  invalidate: () => void;
};

export function useTradeWriteDraftPhotoRestoreGuard(): TradeWriteDraftPhotoRestoreGuard {
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return useMemo(
    () => ({
      begin: () => {
        const token = ++tokenRef.current;
        return () => mountedRef.current && token === tokenRef.current;
      },
      invalidate: () => {
        tokenRef.current += 1;
      },
    }),
    []
  );
}

/**
 * 복원 결과 적용 또는 폐기. 폐기 시 그 결과로 만든 blob URL 을 해제한다(https 는 건드리지 않음).
 * @returns 적용했으면 true
 */
export function settleTradeWriteDraftPhotoRestore<T extends { url: string }>(
  isCurrent: () => boolean,
  items: readonly T[],
  apply: (items: T[]) => void
): boolean {
  if (!isCurrent()) {
    revokeBlobUrlsExcept(items.map((i) => i.url));
    return false;
  }
  apply([...items]);
  return true;
}

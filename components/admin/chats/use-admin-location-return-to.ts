"use client";

/**
 * 채팅 Admin R1 (B) — 현재 위치·returnTo 읽기 (Suspense 없는 상세 페이지에서도 쓰도록 window.location 기반).
 * - `returnTo`: 현재 URL 의 `?returnTo=` (안전한 /admin 경로만)
 * - `here`: 다른 도메인 화면으로 갈 때 넘길 현재 경로 (pathname + search)
 * 링크는 데이터 로드 뒤에만 그려지므로(첫 렌더 = 로딩) 서버/클라이언트 초기값 차이가 출력에 드러나지 않는다.
 */
import { useState } from "react";
import { readAdminReturnToFromSearch, sanitizeAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

function readLocation(): { returnTo: string | null; here: string | null } {
  if (typeof window === "undefined") return { returnTo: null, here: null };
  const { pathname, search } = window.location;
  return {
    returnTo: readAdminReturnToFromSearch(search),
    here: sanitizeAdminReturnTo(`${pathname}${search}`),
  };
}

export function useAdminLocationReturnTo(): { returnTo: string | null; here: string | null } {
  const [state] = useState(readLocation);
  return state;
}

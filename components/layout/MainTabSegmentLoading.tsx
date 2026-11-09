"use client";

import { usePathname } from "next/navigation";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";

/**
 * R-0 (Owner 승인 2026-11-10) — 하단 탭 세그먼트 `loading.tsx` 공용 fallback.
 *
 * 원인: 하단 탭은 미리 받은 경로 정보로 새 화면 트리를 먼저 반영하고(Next segment-cache `navigateUsingPrefetchedRouteTree`),
 * page 가 아직 비어 있는 동안 세그먼트 `loading.tsx` 를 그린다. 이 값이 `null` 이라 본문이 흰 화면이었다
 * (평소 0.4~0.7초, 배포 직후에는 빌드 ID 불일치 → 문서 이동까지 약 2.5초 — 2026-11-10 03:50 Samsung 실측).
 *
 * 규칙:
 * - **탭 첫 화면 경로에서만** 중립 블록을 그린다. 문서 이동 뒤 첫 그림(`MainShellDocumentLoading`)과 같은 모양.
 * - 하위 화면(글쓰기·내 활동·상세 등)은 기존대로 `null` — 그 화면의 자체 스켈레톤이 단일 소유자(설계서 §13-2·3).
 * - 피드 스켈레톤(`MainFeedRouteLoading`·`CommunityFeedSkeleton`)은 쓰지 않는다.
 */
export function MainTabSegmentLoading({ tabRootPath }: { tabRootPath: string }) {
  const pathname = usePathname();
  const path = (pathname ?? "").replace(/\/+$/, "") || "/";
  if (path !== tabRootPath) return null;
  return (
    <div
      data-main-tab-segment-loading=""
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-sam-app"
    >
      <MainFormRouteLoading />
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { BottomNavHubSkeleton } from "@/components/layout/BottomNavHubSkeleton";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";

/**
 * `/mypage` 세그먼트 로딩 경계.
 *
 * - 허브 첫 화면(`/mypage`)만: 하단 탭 이동 뼈대(`BottomNavHubSkeleton hub="mypage"`)와 **같은 그림** — 하단 탭 계약 v2(Owner 2026-11-15):
 *   손 뗀 프레임 뼈대 → 경로 확정 뒤 서버 응답 대기 → 내용이 흰 화면 없이 이어진다(예전 `null` 은 그 사이 본문이 비었다 — 내정보 실측 14:02 PHT).
 * - 하위 화면: 허브 뼈대를 섞지 않고 DIBAY 대기 스피너(450ms 뒤) — 예전 `null` 은 서버 응답 전 본문이 비었다
 *   (`docs/audit/loading-spinner-network-notice-design-2026-11-22.md` W1·W2, 예: `section/[section]/[item]` 서버 셸 대기).
 */
const HUB_ROOTS = new Set<string>(["/mypage"]);

export default function MypageSegmentLoading() {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  if (!HUB_ROOTS.has(pathname)) return <DibayPendingSpinner />;
  return <BottomNavHubSkeleton hub="mypage" />;
}

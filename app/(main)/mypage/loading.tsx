"use client";

import { usePathname } from "next/navigation";
import { BottomNavHubSkeleton } from "@/components/layout/BottomNavHubSkeleton";

/**
 * `/mypage` 세그먼트 로딩 경계.
 *
 * - 허브 첫 화면(`/mypage`)만: 하단 탭 이동 뼈대(`BottomNavHubSkeleton hub="mypage"`)와 **같은 그림** — 하단 탭 계약 v2(Owner 2026-11-15):
 *   손 뗀 프레임 뼈대 → 경로 확정 뒤 서버 응답 대기 → 내용이 흰 화면 없이 이어진다(예전 `null` 은 그 사이 본문이 비었다 — 내정보 실측 14:02 PHT).
 * - 하위 화면은 그대로 아무것도 그리지 않는다 — 각 화면이 자기 로딩을 소유하고, 허브 뼈대가 섞이지 않게.
 */
const HUB_ROOTS = new Set<string>(["/mypage"]);

export default function MypageSegmentLoading() {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  if (!HUB_ROOTS.has(pathname)) return null;
  return <BottomNavHubSkeleton hub="mypage" />;
}

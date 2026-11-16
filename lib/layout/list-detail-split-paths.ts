/**
 * S4 — 넓은 창 목록 | 상세 두 칸을 쓰는 경로 (지금은 LOUNGE 만).
 * 설계: docs/audit/lounge-split-s4-design-2026-11-16.md
 *
 * - 목록 = 커뮤니티 허브(`resolveMainTabKeepAliveHub === "community"`, 허브 화면 보관대가 보관하는 화면)
 * - 상세 = 라운지 글 상세(`isPhilifeNeighborhoodPostDetailPathname`)
 * MARKET·MY 는 각 단계에서 여기에 더한다.
 */
import { isPhilifeNeighborhoodPostDetailPathname } from "@/lib/layout/conditional-app-shell-flags";
import { resolveMainTabKeepAliveHub, type MainTabKeepAliveHubId } from "@/lib/layout/resolve-main-surface";

export type ListDetailSplitRole = "list" | "detail";

export type ListDetailSplitRoute = {
  /** 목록 칸에 보일 보관 허브 */
  hub: MainTabKeepAliveHubId;
  /** 목록 칸 머리글을 그릴 허브 주소 */
  hubPath: string;
  role: ListDetailSplitRole;
};

export function resolveListDetailSplitRoute(pathname: string | null | undefined): ListDetailSplitRoute | null {
  if (!pathname) return null;
  if (resolveMainTabKeepAliveHub(pathname) === "community") {
    return { hub: "community", hubPath: "/philife", role: "list" };
  }
  if (isPhilifeNeighborhoodPostDetailPathname(pathname)) {
    return { hub: "community", hubPath: "/philife", role: "detail" };
  }
  return null;
}

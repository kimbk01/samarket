"use client";

import { useMemo } from "react";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import {
  adminAccessActorFromMe,
  resolveAdminRouteActionState,
  type AdminRouteActionState,
} from "@/lib/admin/access/admin-access-ui";
import type { AdminRouteAccessActor } from "@/lib/admin/access/admin-route-access";

/** 셸의 `/api/admin/me` 스냅샷(추가 요청 없음) → 접근표 actor. */
export function useAdminAccessActor(): { actor: AdminRouteAccessActor | null; loading: boolean } {
  const { adminMe, adminMeLoading } = useAdminShell();
  const actor = useMemo(() => adminAccessActorFromMe(adminMe), [adminMe]);
  return { actor, loading: adminMeLoading };
}

/**
 * 화면 안 쓰기 작업 버튼 판정 — 접근표 `action` 요구 권한 기준 (설계 v4 §4-2 #3).
 * 서버 가드는 그대로이며, 이 훅은 버튼 비활성·사유 표시에만 쓴다.
 */
export function useAdminRouteAction(pathname: string): AdminRouteActionState {
  const { actor, loading } = useAdminAccessActor();
  return useMemo(
    () => resolveAdminRouteActionState({ href: pathname, actor, actorLoading: loading }),
    [pathname, actor, loading]
  );
}

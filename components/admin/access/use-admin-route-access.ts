"use client";

import { useMemo } from "react";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
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

/**
 * 재감사 S-2 (H-4): 쓰기 함수 맨 앞에서 부르는 권한 확인 — 권한이 없으면 사유 입력·확인창 **전에** 이유를 알리고 멈춘다
 * (예전에는 사유까지 쓴 뒤 서버 403). 접근표 `action` 요구 권한 = 서버 가드와 같은 키.
 */
export function useAdminWriteGuard(pathname: string): AdminRouteActionState & { guard: () => boolean } {
  const state = useAdminRouteAction(pathname);
  const { t } = useI18n();
  return useMemo(
    () => ({
      ...state,
      guard: () => {
        if (state.allowed) return true;
        if (!state.loading) void dibayAlert({ title: state.reason ?? t("admin_access_no_permission_for_action") });
        return false;
      },
    }),
    [state, t]
  );
}

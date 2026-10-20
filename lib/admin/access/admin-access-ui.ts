/**
 * 접근표(`admin-route-access.ts`)를 UI 에 연결하는 순수 함수 (설계 v4 §4-2 · §4-3, F2).
 *
 * 원칙: 메뉴 노출 = 서버 권한. 여기서는 **서버가 이미 강제하는 권한을 화면에 반영만** 한다
 * (사이드바·바로가기 숨김 / 페이지 접근 거부 패널 / 쓰기 버튼 비활성). 권한을 새로 만들거나 줄이지 않는다.
 *
 * actor 가 없을 때(/me 실패·로컬 테스트 역할) 는 기존 동작(역할 필터만)을 유지한다 — 최종 판정은 서버 가드.
 * Client-safe (서버 모듈 import 없음).
 */

import type { AdminMenuItem } from "@/components/admin/admin-menu";
import type { AdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import {
  actorMeetsAdminRouteRequirement,
  canAccessAdminRoute,
  resolveAdminRouteAccess,
  type AdminRouteAccessActor,
  type AdminRouteRequirement,
} from "@/lib/admin/access/admin-route-access";

/** `/api/admin/me` 스냅샷 → 접근표 actor. 스냅샷이 없으면 null (기존 동작 유지). */
export function adminAccessActorFromMe(
  me: Pick<AdminMeSnapshot, "role" | "permissions"> & { isDeployOwner?: boolean } | null | undefined
): AdminRouteAccessActor | null {
  if (!me) return null;
  return {
    role: me.role,
    permissions: me.permissions ?? [],
    isDeployOwner: me.isDeployOwner === true,
  };
}

/**
 * 접근표로 메뉴 트리를 거른다 — 열 수 없는 leaf 를 숨기고, 비게 된 섹션·워크스페이스를 뺀다.
 * 역할 필터(`filterMenuByRole`)와 함께 쓴다 (순서 무관, 둘 다 순수 필터).
 */
export function filterAdminMenuByAccess(
  menu: readonly AdminMenuItem[],
  actor: AdminRouteAccessActor
): AdminMenuItem[] {
  function filter(items: readonly AdminMenuItem[]): AdminMenuItem[] {
    const out: AdminMenuItem[] = [];
    for (const item of items) {
      const pathAllowed = !item.path || canAccessAdminRoute(item.path, actor);
      if (item.children?.length) {
        const children = filter(item.children);
        if (children.length > 0) {
          out.push({ ...item, children });
        } else if (item.path && pathAllowed) {
          out.push({ ...item, children: undefined });
        }
        continue;
      }
      if (!item.path || pathAllowed) out.push(item);
    }
    return out;
  }
  return filter(menu);
}

export type AdminPageGateDecision = "allow" | "deny" | "loading";

/**
 * 현재 화면을 보여 줄지 판정.
 * - actor 있음: 표의 요구 권한 충족 → allow, 아니면 deny (접근 거부 패널).
 * - actor 로딩 중: any_admin 화면은 allow, 그 밖은 loading (403 날 API 를 미리 부르지 않게).
 * - actor 없음(로딩 끝): allow — 서버 가드가 최종 판정 (UI 가 권한을 새로 막지 않는다).
 */
export function decideAdminPageGate(input: {
  href: string;
  actor: AdminRouteAccessActor | null;
  actorLoading: boolean;
}): AdminPageGateDecision {
  const { requirement } = resolveAdminRouteAccess(input.href);
  if (input.actor) {
    return actorMeetsAdminRouteRequirement(requirement, input.actor) ? "allow" : "deny";
  }
  if (input.actorLoading && requirement.kind !== "any_admin") return "loading";
  return "allow";
}

/** 쓰기 작업이 막힌 이유 (짧은 한국어 문구). */
export function describeAdminRequirementDenial(requirement: AdminRouteRequirement): string {
  switch (requirement.kind) {
    case "deploy_owner":
      return "배포 담당자만 실행할 수 있습니다.";
    case "super_admin":
      return "최고관리자만 실행할 수 있습니다.";
    case "permission":
      return `「${requirement.key}」 권한이 있어야 실행할 수 있습니다.`;
    case "domain":
      if (requirement.guard === "community") return `커뮤니티 「${requirement.area}」 권한이 있어야 실행할 수 있습니다.`;
      if (requirement.guard === "chat") return "채팅 관리 권한이 있어야 실행할 수 있습니다.";
      return "권한이 있어야 실행할 수 있습니다.";
    case "any_admin":
      return "관리자만 실행할 수 있습니다.";
  }
}

export type AdminRouteActionState = {
  allowed: boolean;
  /** 막혔을 때만 — 짧은 한국어 사유 */
  reason: string | null;
  /** actor 로딩 중이라 아직 판정하지 못함 (allowed=false) */
  loading: boolean;
};

/** 화면 안 쓰기 작업(`action`) 허용 여부. actor 가 없으면(로딩 끝) 서버 가드에 맡긴다. */
export function resolveAdminRouteActionState(input: {
  href: string;
  actor: AdminRouteAccessActor | null;
  actorLoading: boolean;
}): AdminRouteActionState {
  const { actionRequirement } = resolveAdminRouteAccess(input.href);
  if (input.actor) {
    const allowed = actorMeetsAdminRouteRequirement(actionRequirement, input.actor);
    return { allowed, reason: allowed ? null : describeAdminRequirementDenial(actionRequirement), loading: false };
  }
  if (input.actorLoading && actionRequirement.kind !== "any_admin") {
    return { allowed: false, reason: null, loading: true };
  }
  return { allowed: true, reason: null, loading: false };
}

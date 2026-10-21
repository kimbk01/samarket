/**
 * 관리자 SSR 페이지 자체 서버 가드 (P1-11 · AD-01).
 *
 * `app/admin/layout.tsx` 게이트만으로는 페이지가 service-role 로 읽은 데이터를 보호한다고 볼 수 없다
 * (클라이언트 `AdminRoutePageGate` 는 표시용). 그래서 서버 렌더 시 데이터를 읽는 페이지는
 * **데이터 조회 전에** 이 함수로 접근표(`admin-route-access.ts`) 요구 권한을 서버에서 직접 강제한다.
 *
 * 판정 = API 가드와 같은 actor(`requireAdminApiActor`: 로그인·활성 세션·활성 admin_memberships·권한 키·정지 운영자 차단)
 * + 접근표 요구 권한(`actorMeetsAdminRouteRequirement`). 실패하면 페이지는 `AdminAccessDeniedPanel` 을 렌더한다.
 */
import "server-only";
import { cache } from "react";
import { requireAdminApiActor, type AdminApiActor } from "@/lib/admin/require-admin-permission";
import {
  actorMeetsAdminRouteRequirement,
  resolveAdminRouteAccess,
  type AdminRouteAccessActor,
} from "@/lib/admin/access/admin-route-access";
import { isDeployOwnerUserId } from "@/lib/admin/deploy-promotion/deploy-owner";
import { isSuspendedMemberAccount } from "@/lib/auth/member-account-state";

export type AdminPageAccessResult =
  | { ok: true; actor: AdminApiActor }
  | { ok: false; reason: "not_admin" | "forbidden" };

/** 같은 RSC 요청 안에서는 actor 조회 1회. 조회 실패 = 관리자 아님(fail-closed). */
const loadAdminPageActor = cache(async (): Promise<AdminApiActor | null> => {
  try {
    const gate = await requireAdminApiActor();
    return gate.ok ? gate.actor : null;
  } catch {
    return null;
  }
});

export function adminPageRouteActor(actor: AdminApiActor): AdminRouteAccessActor {
  return {
    role: actor.role,
    permissions: actor.permissions,
    isDeployOwner: actor.isSuperAdmin && isDeployOwnerUserId(actor.userId),
    accountSuspended: !actor.isSuperAdmin && isSuspendedMemberAccount(actor.profile),
  };
}

/** 순수 판정 — actor 와 경로(`/admin/...`, 쿼리 포함 가능)로 접근 가능 여부. */
export function decideAdminPageAccess(actor: AdminApiActor | null, href: string): AdminPageAccessResult {
  if (!actor) return { ok: false, reason: "not_admin" };
  const { requirement } = resolveAdminRouteAccess(href);
  if (!actorMeetsAdminRouteRequirement(requirement, adminPageRouteActor(actor))) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, actor };
}

/**
 * 페이지 서버 가드 — 데이터 조회 **전에** 호출한다.
 * 예: `const access = await requireAdminPageAccess("/admin/community/reports"); if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;`
 */
export async function requireAdminPageAccess(href: string): Promise<AdminPageAccessResult> {
  return decideAdminPageAccess(await loadAdminPageActor(), href);
}

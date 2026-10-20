"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { decideAdminPageGate } from "@/lib/admin/access/admin-access-ui";

/**
 * 셸 본문 게이트 (설계 v4 §4-3) — 접근표 요구 권한을 충족하지 못하면 접근 거부 패널,
 * `/me` 로딩 중이고 any_admin 보다 강한 화면이면 중립 로딩(403 날 API 호출 방지).
 * 서버 세그먼트 게이트(`SuperAdminOnlyPageGate`)·API 가드는 그대로 유지된다.
 */
export function AdminRoutePageGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const { actor, loading } = useAdminAccessActor();
  const href = search ? `${pathname}?${search}` : pathname;
  const decision = decideAdminPageGate({ href, actor, actorLoading: loading });

  if (decision === "deny") return <AdminAccessDeniedPanel backHref="/admin" />;
  if (decision === "loading") {
    return <div className="min-h-[40vh]" aria-busy="true" data-admin-route-gate="loading" />;
  }
  return <>{children}</>;
}

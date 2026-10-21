import { Suspense } from "react";
import { CommunityDashboard } from "@/components/admin/community/dashboard/CommunityDashboard";
import { loadCommunityDomainDashboard } from "@/lib/admin/domain-dashboard/load-community-domain-dashboard";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

export default async function AdminCommunityRoute({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  // P1-11 · AD-01: 관리자 actor 를 읽지 못하면(scope 없음) 전체 지표를 보여 주지 않고 거부한다.
  const access = await requireAdminPageAccess("/admin/community");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  // 보는 관리자의 권한 — 권한 밖 지표는 숨긴다 (설계 §D-1).
  const scope = { isSuperAdmin: access.actor.isSuperAdmin, permissions: access.actor.permissions };
  const model = await loadCommunityDomainDashboard({
    period: one(sp.period) ?? "7d",
    from: one(sp.from),
    to: one(sp.to),
    scope,
  });
  return (
    <Suspense fallback={null}>
      <CommunityDashboard model={model} isSuperAdmin={scope.isSuperAdmin} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { CommunityDashboard } from "@/components/admin/community/dashboard/CommunityDashboard";
import { loadCommunityDomainDashboard } from "@/lib/admin/domain-dashboard/load-community-domain-dashboard";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

export default async function AdminCommunityRoute({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  // 보는 관리자의 권한 — 권한 밖 지표는 숨긴다 (설계 §D-1). 읽지 못하면 서버 API 권한 검사를 따른다.
  const actor = await requireAdminApiActor().catch(() => null);
  const scope = actor?.ok ? { isSuperAdmin: actor.actor.isSuperAdmin, permissions: actor.actor.permissions } : null;
  const model = await loadCommunityDomainDashboard({
    period: one(sp.period) ?? "7d",
    from: one(sp.from),
    to: one(sp.to),
    scope,
  });
  return (
    <Suspense fallback={null}>
      <CommunityDashboard model={model} isSuperAdmin={Boolean(scope?.isSuperAdmin)} />
    </Suspense>
  );
}

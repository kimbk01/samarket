import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import { AdminDomainDashboardShell } from "@/components/admin/domain-dashboard/AdminDomainDashboardShell";
import { loadMessengerDomainDashboard } from "@/lib/admin/domain-dashboard/load-messenger-domain-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminMessengerDomainDashboardPage() {
  // P1-11 · AD-01: 서버 렌더 데이터 조회 전 페이지 자체 권한 가드 (레이아웃 게이트에만 의존하지 않음)
  const access = await requireAdminPageAccess("/admin/messenger");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  const model = await loadMessengerDomainDashboard();
  return <AdminDomainDashboardShell model={model} />;
}

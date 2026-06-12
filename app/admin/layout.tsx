import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { getOptionalAdminUserIdCached } from "@/lib/admin/get-optional-admin-user-id-cached";
import { isAdminRequireAuthEnabled } from "@/lib/auth/admin-policy";

/** 빌드(SSG) 시 Supabase 조회가 60s+ 걸려 타임아웃 나는 일 방지 — 요청 시 렌더만 */
export const dynamic = "force-dynamic";

/**
 * 운영·스테이징(`isAdminRequireAuthEnabled`): 서버에서 `verifyAdminAccess`로 먼저 차단 —
 * HTML·JS 청크 노출 전에 권한 없는 세션을 걸러낸다. 로컬은 기존 `AdminGuard`(세션스토리지 테스트 역할 등) 유지.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isAdminRequireAuthEnabled()) {
    const adminId = await getOptionalAdminUserIdCached();
    if (!adminId) {
      return (
        <div className="min-h-screen bg-sam-surface-muted">
          <AdminAccessDeniedPanel />
        </div>
      );
    }
    return <AdminShell>{children}</AdminShell>;
  }

  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}

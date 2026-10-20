import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";

/**
 * 운영 홈 = 통합 대시보드 (설계 v4 §3 · F4). 수치는 클라이언트가 `/api/admin/dashboard/overview` 에서
 * 탭별로 받는다 (관리자 권한 범위 적용 — 서버 첫 렌더 선조회 없음).
 */
export default function AdminPage() {
  return <AdminDashboardPage />;
}

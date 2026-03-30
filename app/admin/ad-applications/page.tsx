import { AdminPostAdManagePage } from "@/components/admin/ads/AdminPostAdManagePage";

/**
 * /admin/ad-applications → 커뮤니티 게시글 광고 신청 관리 (post_ads 시스템)
 * 구형 AdApplication 시스템은 /admin/ad-applications/legacy 로 이동 예정
 */
export default function AdminAdApplicationsPage() {
  return <AdminPostAdManagePage />;
}

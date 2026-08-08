import { AdminCommunityPromotionQueue } from "@/components/admin/ads/AdminCommunityPromotionQueue";
import { AdminFeedAdRequestQueue } from "@/components/admin/ads/AdminFeedAdRequestQueue";

/**
 * /admin/ad-applications — 광고 신청 관리
 * 1) 게시물 홍보 신청 (Community paid exposure)
 * 2) 피드 광고 신청 (Member banner request)
 * Legacy post_ads queue removed from primary surface (read-compat via /admin/post-ads).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 */
export default function AdminAdApplicationsPage() {
  return (
    <div className="space-y-2">
      <AdminCommunityPromotionQueue />
      <AdminFeedAdRequestQueue />
    </div>
  );
}

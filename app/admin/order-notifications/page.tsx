import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminNotificationList } from "@/components/admin/order-notifications/AdminNotificationList";

export default function AdminOrderNotificationsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        title="운영 알림"
        description="취소·환불·분쟁 등 시뮬/데모 알림 스토어와 연동된 목록입니다. 실운영 알림은 별도 채널·감사 로그와 함께 검증하세요."
      />
      <AdminNotificationList />
    </div>
  );
}

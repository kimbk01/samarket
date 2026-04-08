import { MemberNotificationSettings } from "@/components/member-orders/MemberNotificationSettings";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageOrderNotificationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="주문 알림 설정"
        subtitle="배달·픽업·주문 상태"
        backHref="/mypage/notifications"
        section="account"
      />
      <div className="mx-auto max-w-[480px] px-4 py-4">
        <MemberNotificationSettings />
      </div>
    </div>
  );
}

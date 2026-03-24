import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { MemberNotificationSettings } from "@/components/member-orders/MemberNotificationSettings";

export default function MyOrderNotificationsSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="주문 알림 설정" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] px-4 py-4">
        <MemberNotificationSettings />
      </div>
    </div>
  );
}

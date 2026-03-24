import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";

export default function NotificationsSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="알림 설정" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <NotificationsSettingsContent />
      </div>
    </div>
  );
}

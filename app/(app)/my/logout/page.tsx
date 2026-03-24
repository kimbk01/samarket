import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { LogoutContent } from "@/components/my/settings/LogoutContent";

export default function LogoutPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="로그아웃" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <LogoutContent />
      </div>
    </div>
  );
}

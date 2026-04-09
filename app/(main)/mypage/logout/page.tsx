import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";

export default function MypageLogoutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="로그아웃" subtitle={null} />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <LogoutContent />
      </div>
    </div>
  );
}

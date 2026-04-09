import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageLogoutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="로그아웃" subtitle={null} />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <LogoutContent />
      </div>
    </div>
  );
}

import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageLogoutPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <SettingsHeader title="로그아웃" subtitle={null} />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <LogoutActionTrigger autoOpen />
      </div>
    </div>
  );
}

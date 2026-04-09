import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function HiddenUsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="숨긴 사용자" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <UserListContent type="hidden" emptyMessage="숨긴 사용자가 없습니다." />
      </div>
    </div>
  );
}

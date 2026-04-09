import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function BlockedUsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="차단한 사용자" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <UserListContent type="blocked" emptyMessage="차단한 사용자가 없습니다." />
      </div>
    </div>
  );
}

import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { UserListContent } from "@/components/my/settings/UserListContent";

export default function BlockedUsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="차단한 사용자" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <UserListContent type="blocked" emptyMessage="차단한 사용자가 없습니다." />
      </div>
    </div>
  );
}

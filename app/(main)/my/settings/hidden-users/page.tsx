import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { UserListContent } from "@/components/my/settings/UserListContent";

export default function HiddenUsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="숨긴 사용자" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <UserListContent type="hidden" emptyMessage="숨긴 사용자가 없습니다." />
      </div>
    </div>
  );
}

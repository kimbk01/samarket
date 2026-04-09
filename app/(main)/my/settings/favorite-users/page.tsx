import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { UserListContent } from "@/components/my/settings/UserListContent";

export default function FavoriteUsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="모아보는 사용자" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <UserListContent type="favorite" emptyMessage="모아보는 사용자가 없습니다." />
      </div>
    </div>
  );
}

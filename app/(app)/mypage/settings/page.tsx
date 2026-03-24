import { SettingsList } from "@/components/mypage/SettingsList";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function MypageSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <AppBackButton backHref="/mypage" ariaLabel="뒤로" />
        <h1 className="text-lg font-semibold text-gray-900">설정</h1>
      </header>
      <div className="px-4 pt-4">
        <SettingsList />
      </div>
    </div>
  );
}

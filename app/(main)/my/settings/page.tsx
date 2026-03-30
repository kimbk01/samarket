import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";

export default function MySettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="설정" backHref="/mypage" />
      <div className="px-0 pt-2">
        <SettingsMainContent />
      </div>
    </div>
  );
}

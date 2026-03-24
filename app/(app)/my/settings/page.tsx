import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";

export default function MySettingsPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="설정" backHref="/my" />
      <div className="px-0 pt-2">
        <SettingsMainContent />
      </div>
    </div>
  );
}

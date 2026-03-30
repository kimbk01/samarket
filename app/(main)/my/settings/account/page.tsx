import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { AccountSettingsContent } from "@/components/my/settings/AccountSettingsContent";

export default function AccountSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="내 계정" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <AccountSettingsContent />
      </div>
    </div>
  );
}

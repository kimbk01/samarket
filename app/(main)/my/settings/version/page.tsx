import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { VersionContent } from "@/components/my/settings/VersionContent";

export default function VersionPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="버전 정보" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <VersionContent />
      </div>
    </div>
  );
}

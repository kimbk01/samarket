import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";

export default function PersonalizationPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="맞춤 설정" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <PersonalizationContent />
      </div>
    </div>
  );
}

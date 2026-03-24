import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";

export default function LanguagePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="언어 설정" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <LanguageSettingsContent />
      </div>
    </div>
  );
}

import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";

export default function CountryPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="국가 변경" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <CountrySettingsContent />
      </div>
    </div>
  );
}

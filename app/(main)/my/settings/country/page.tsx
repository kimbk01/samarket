import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function CountryPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="국가 변경" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <CountrySettingsContent />
      </div>
    </div>
  );
}

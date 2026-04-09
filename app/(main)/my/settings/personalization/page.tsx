import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function PersonalizationPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="맞춤 설정" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <PersonalizationContent />
      </div>
    </div>
  );
}

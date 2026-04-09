import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { VersionContent } from "@/components/my/settings/VersionContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function VersionPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="버전 정보" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <VersionContent />
      </div>
    </div>
  );
}

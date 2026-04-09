import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function CachePage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="캐시 삭제" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <CacheSettingsContent />
      </div>
    </div>
  );
}

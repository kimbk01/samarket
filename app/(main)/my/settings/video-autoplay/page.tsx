import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function VideoAutoplayPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="동영상 자동 재생" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <VideoAutoplayContent />
      </div>
    </div>
  );
}

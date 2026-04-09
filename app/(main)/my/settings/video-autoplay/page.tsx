import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";

export default function VideoAutoplayPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="동영상 자동 재생" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <VideoAutoplayContent />
      </div>
    </div>
  );
}

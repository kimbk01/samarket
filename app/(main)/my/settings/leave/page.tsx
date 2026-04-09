import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { LeaveContent } from "@/components/my/settings/LeaveContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function LeavePage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="탈퇴하기" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <LeaveContent />
      </div>
    </div>
  );
}

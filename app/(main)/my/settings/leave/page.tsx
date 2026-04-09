import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { LeaveContent } from "@/components/my/settings/LeaveContent";

export default function LeavePage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="탈퇴하기" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <LeaveContent />
      </div>
    </div>
  );
}

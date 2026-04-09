import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function ChatSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="채팅 설정" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <ChatSettingsContent />
      </div>
    </div>
  );
}

import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";

export default function ChatSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="채팅 설정" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <ChatSettingsContent />
      </div>
    </div>
  );
}

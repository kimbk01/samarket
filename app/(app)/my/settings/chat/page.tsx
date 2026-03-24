import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";

export default function ChatSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="채팅 설정" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <ChatSettingsContent />
      </div>
    </div>
  );
}

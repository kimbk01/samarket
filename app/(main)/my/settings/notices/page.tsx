import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { NoticesContent } from "@/components/my/settings/NoticesContent";

export default function NoticesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="공지사항" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <NoticesContent />
      </div>
    </div>
  );
}

import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { NoticesContent } from "@/components/my/settings/NoticesContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function NoticesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="공지사항" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <NoticesContent />
      </div>
    </div>
  );
}

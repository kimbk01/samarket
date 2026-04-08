import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageNotificationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="알림 설정"
        subtitle="푸시·이메일·방해금지"
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <NotificationsSettingsContent />
      </div>
    </div>
  );
}

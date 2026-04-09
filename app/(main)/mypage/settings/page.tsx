import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="앱 설정"
        subtitle="언어, 국가, 차단, 캐시, 공지, 버전"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <SettingsMainContent />
      </div>
    </div>
  );
}

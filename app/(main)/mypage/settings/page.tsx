import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="앱 설정"
        subtitle="언어, 국가, 차단, 캐시, 공지, 버전"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className="mx-auto max-w-[480px] px-4 py-4">
        <SettingsMainContent />
      </div>
    </div>
  );
}

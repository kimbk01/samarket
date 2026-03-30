import { MyAccountContent } from "@/components/my/MyAccountContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyAccountPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="내 계정"
        subtitle="프로필·인증·연락처"
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        <MyAccountContent />
      </div>
    </div>
  );
}

import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageEditPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="프로필 수정"
        subtitle="닉네임, 사진, 프로필, 지역, 동네"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className="mx-auto max-w-4xl px-4 py-4">
        <ProfileEditForm />
      </div>
    </div>
  );
}

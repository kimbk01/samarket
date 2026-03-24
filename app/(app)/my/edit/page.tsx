import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function MyEditPage() {
  return (
    <div className="mx-auto max-w-[480px] px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <AppBackButton backHref="/my" />
        <h1 className="text-[18px] font-semibold text-gray-900">프로필 수정</h1>
      </div>
      <ProfileEditForm />
    </div>
  );
}

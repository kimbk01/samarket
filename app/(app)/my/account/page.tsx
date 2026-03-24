import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MyAccountContent } from "@/components/my/MyAccountContent";

export default function MyAccountPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="sticky top-0 z-10 flex h-12 items-center border-b border-gray-200 bg-white px-4">
        <AppBackButton backHref="/my" />
        <h1 className="text-[17px] font-semibold text-gray-900">내 계정</h1>
      </div>
      <div className="mx-auto max-w-[480px] px-4 py-4">
        <MyAccountContent />
      </div>
    </div>
  );
}

import Link from "next/link";
import { SettingsSubLayout } from "@/components/mypage/SettingsSubLayout";

export default function LogoutPage() {
  return (
    <SettingsSubLayout title="로그아웃" backHref="/mypage/settings">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <p className="text-[14px] text-gray-700">로그아웃 하시겠습니까?</p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/mypage/settings"
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center text-[14px] font-medium text-gray-700"
          >
            취소
          </Link>
          <Link
            href="/home"
            className="flex-1 rounded-lg bg-gray-900 py-2.5 text-center text-[14px] font-medium text-white"
          >
            로그아웃
          </Link>
        </div>
      </div>
    </SettingsSubLayout>
  );
}

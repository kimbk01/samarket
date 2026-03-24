import Link from "next/link";

export function ProfileActionButtons() {
  return (
    <div className="mt-3 flex gap-2">
      <Link
        href="/my/edit"
        className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-center text-[14px] font-medium text-gray-700"
      >
        프로필 수정
      </Link>
      <Link
        href="/my/settings"
        className="flex-1 rounded-lg border border-signature bg-signature/10 py-2.5 text-center text-[14px] font-medium text-signature"
      >
        설정
      </Link>
    </div>
  );
}

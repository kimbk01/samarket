import Link from "next/link";

export default function NotFound() {
  /* 루트 layout이 이미 <html>/<body>를 제공하므로 여기서는 조각만 렌더링 */
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <p className="text-[40px] font-bold text-gray-200">404</p>
      <p className="mt-2 text-[16px] font-medium text-gray-900">
        페이지를 찾을 수 없어요
      </p>
      <p className="mt-2 text-[13px] text-gray-500">
        주소를 다시 확인하거나 홈으로 이동해 주세요.
      </p>
      <Link
        href="/home"
        className="mt-8 rounded-ui-rect bg-signature px-6 py-2.5 text-[14px] font-medium text-white"
      >
        홈으로 이동
      </Link>
    </div>
  );
}

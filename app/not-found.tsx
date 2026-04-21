import Link from "next/link";

export default function NotFound() {
  /* 루트 layout이 이미 <html>/<body>를 제공하므로 여기서는 조각만 렌더링 */
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <p className="sam-text-hero font-bold text-sam-meta">404</p>
      <p className="mt-2 sam-text-body-lg font-medium text-sam-fg">
        페이지를 찾을 수 없어요
      </p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">
        주소를 다시 확인하거나 홈으로 이동해 주세요.
      </p>
      <Link
        href="/home"
        className="mt-8 rounded-ui-rect bg-signature px-6 py-2.5 sam-text-body font-medium text-white"
      >
        홈으로 이동
      </Link>
    </div>
  );
}

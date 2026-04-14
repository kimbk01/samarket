import Link from "next/link";

/**
 * 관리자 미인증 시 안내 — `AdminGuard`(클라)와 `app/admin/layout`(서버 게이트) 공통.
 */
export function AdminAccessDeniedPanel() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[15px] font-medium text-sam-fg">관리자 인증이 필요합니다</p>
      <p className="mt-2 text-[13px] text-sam-muted">
        개발용 계정은 로그인 페이지에서 aaaa(또는 해당 계정)로 로그인한 뒤 다시 열어 주세요. Supabase만 쓰는 경우{" "}
        <code className="rounded bg-sam-surface-muted px-1">NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL</code>에 이메일을 넣어
        주세요.
      </p>
      <Link href="/home" className="mt-4 text-[14px] font-medium text-signature underline">
        홈으로
      </Link>
    </div>
  );
}

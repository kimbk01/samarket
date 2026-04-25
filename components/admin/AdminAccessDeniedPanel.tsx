import Link from "next/link";

/**
 * 관리자 미인증 시 안내 — `AdminGuard`(클라)와 `app/admin/layout`(서버 게이트) 공통.
 */
export function AdminAccessDeniedPanel() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="sam-text-body font-medium text-sam-fg">관리자 인증이 필요합니다</p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">
        관리자 권한은 서버의 회원 프로필 역할로만 확인합니다. 관리자 계정으로 다시 로그인한 뒤 접근해 주세요.
      </p>
      <Link href="/home" className="mt-4 sam-text-body font-medium text-signature underline">
        홈으로
      </Link>
    </div>
  );
}

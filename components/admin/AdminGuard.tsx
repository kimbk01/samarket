"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getTestAuth } from "@/lib/auth/test-auth-store";
import { getAllowedAdminEmails, isAdminRequireAuthEnabled } from "@/lib/auth/admin-policy";

/**
 * 관리자 영역 접근 제어
 * - 테스트: aaaa(admin) 로그인 시 허용
 * - NEXT_PUBLIC_ADMIN_REQUIRE_AUTH=true 시: Supabase 로그인 + 이메일이 ADMIN_ALLOWED_EMAIL에 있어야 접근
 * - 그 외: 인증 없이 접근 가능 (개발/테스트용)
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const requireAuth = isAdminRequireAuthEnabled();

  const [allowed, setAllowed] = useState(!requireAuth);
  const [checking, setChecking] = useState(requireAuth);

  useEffect(() => {
    if (!requireAuth) return;
    const test = getTestAuth();
    if (
      test &&
      (test.username === "aaaa" || test.role === "admin" || test.role === "master")
    ) {
      setAllowed(true);
      setChecking(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setChecking(false);
      setAllowed(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const allowedEmails = getAllowedAdminEmails();
      const ok = !!session?.user?.email && allowedEmails.includes(session.user.email);
      setAllowed(ok);
      setChecking(false);
    });
  }, [requireAuth]);

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[14px] text-gray-500">
        확인 중…
      </div>
    );
  }

  if (requireAuth && !allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-[15px] font-medium text-gray-900">
          관리자 인증이 필요합니다
        </p>
        <p className="mt-2 text-[13px] text-gray-500">
          관리자로 지정된 이메일로 로그인해 주세요.
        </p>
        <Link href="/login" className="mt-4 text-[14px] font-medium text-signature underline">
          로그인
        </Link>
        <Link href="/home" className="mt-4 text-[14px] text-gray-500">
          홈으로
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

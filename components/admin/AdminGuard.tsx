"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getTestAuth, TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  getAllowedAdminEmails,
  isAdminRequireAuthEnabled,
  isPrivilegedAdminRole,
} from "@/lib/auth/admin-policy";

async function fetchServerAdminAccess(): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/access-check", { credentials: "include" });
    const data = (await res.json()) as { ok?: boolean };
    return !!data?.ok;
  } catch {
    return false;
  }
}

/**
 * 관리자 영역 접근 제어
 * - production·staging: 서버 `isRouteAdmin`과 동일하게 판별 (test-login 쿠키 + test_users.role 포함)
 * - 허용 이메일(NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL) + Supabase 세션
 * - sessionStorage 테스트 역할(admin/master) — 표기 정규화
 * - local만: NEXT_PUBLIC_ADMIN_REQUIRE_AUTH 미설정 시 개발 편의로 개방
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const requireAuth = isAdminRequireAuthEnabled();

  const [allowed, setAllowed] = useState(!requireAuth);
  const [checking, setChecking] = useState(requireAuth);

  useEffect(() => {
    if (!requireAuth) return;

    let cancelled = false;

    const run = async () => {
      const test = getTestAuth();
      if (test && isPrivilegedAdminRole(test.role)) {
        if (!cancelled) {
          setAllowed(true);
          setChecking(false);
        }
        return;
      }

      const supabase = getSupabaseClient();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const allowedEmails = getAllowedAdminEmails();
        if (user?.email && allowedEmails.includes(user.email)) {
          if (!cancelled) {
            setAllowed(true);
            setChecking(false);
          }
          return;
        }
      }

      const serverOk = await fetchServerAdminAccess();
      if (!cancelled) {
        setAllowed(serverOk);
        setChecking(false);
      }
    };

    void run();

    const onTestAuth = () => {
      if (!cancelled) {
        setChecking(true);
        void run();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
    }

    const supabase = getSupabaseClient();
    let unsubAuth: () => void = () => {};
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        if (!cancelled) {
          setChecking(true);
          void run();
        }
      });
      unsubAuth = () => subscription.unsubscribe();
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
      }
      unsubAuth();
    };
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
        <p className="text-[15px] font-medium text-gray-900">관리자 인증이 필요합니다</p>
        <p className="mt-2 text-[13px] text-gray-500">
          개발용 계정은 로그인 페이지에서 aaaa(또는 해당 계정)로 로그인한 뒤 다시 열어 주세요. Supabase만 쓰는 경우{" "}
          <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL</code>에 이메일을 넣어
          주세요.
        </p>
        <Link href="/home" className="mt-4 text-[14px] font-medium text-signature underline">
          홈으로
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

"use client";

import { ReactNode, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { getTestAuth, TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getAllowedAdminEmails, isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

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
 * - 서버 `/api/admin/access-check`(`isRouteAdmin`)과 동일 — 로그인만으로는 통과하지 않음
 * - 허용 이메일(NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL) + Supabase 세션
 * - sessionStorage 테스트 역할(admin/master) — 표기 정규화
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
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
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center sam-text-body text-sam-muted">
        확인 중…
      </div>
    );
  }

  if (!allowed) {
    return <AdminAccessDeniedPanel />;
  }

  return <>{children}</>;
}

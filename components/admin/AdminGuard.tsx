"use client";

import { ReactNode, useEffect, useState } from "react";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { getSupabaseClient } from "@/lib/supabase/client";

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
 * - 서버 `/api/admin/access-check` 기준으로만 허용한다.
 * - 클라이언트 캐시/공개 env/테스트 세션으로 관리자 판정하지 않는다.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const serverOk = await fetchServerAdminAccess();
      if (!cancelled) {
        setAllowed(serverOk);
        setChecking(false);
      }
    };

    void run();

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

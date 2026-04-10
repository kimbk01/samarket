"use client";

import { useEffect, useState } from "react";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";

/**
 * `isRouteAdmin()` 과 동일 — `/api/admin/access-check` (AdminGuard 와 공유).
 * 관리자로 지정된 계정에만 설정 섹션 목록 하단에 표시.
 */
export function MyPageAdminMenuEntry() {
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/access-check", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!cancelled && data?.ok === true) setShow(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !show) return null;

  return <MyPageMobileMenuRow href="/admin" title="관리자 접속" />;
}

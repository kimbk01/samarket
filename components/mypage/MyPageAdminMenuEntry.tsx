"use client";

import { useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";

/**
 * `isRouteAdmin()` 과 동일 — `/api/admin/access-check` (AdminGuard 와 공유).
 * 관리자로 지정된 계정에만 표시 (설정 섹션 목록 하단·내정보 홈 하단 등).
 */
export function MyPageAdminMenuEntry({
  /** 홈 대시보드 `<ul>` 안에서만 `true` — 유효한 마크업(`<li>`) */
  asListItem = false,
  /** @deprecated `asListItem` 사용 */
  wrapInStandaloneCard = false,
}: { asListItem?: boolean; wrapInStandaloneCard?: boolean } = {}) {
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await runSingleFlight("admin:access-check:get", () =>
          fetch("/api/admin/access-check", { credentials: "include" })
        );
        const data = (await res.clone().json().catch(() => ({}))) as { ok?: boolean };
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

  const row = <MyPageMobileMenuRow href="/admin" title="관리자 접속" surface={asListItem || wrapInStandaloneCard ? "card" : "grouped"} />;
  if (asListItem) {
    return <li className="list-none">{row}</li>;
  }
  return row;
}

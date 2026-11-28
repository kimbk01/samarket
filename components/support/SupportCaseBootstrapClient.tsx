"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";
import {
  ensureSessionHealthy,
  getSessionPhase,
} from "@/lib/auth/dibay-session-manager";
import { deliverSupportOpenAfterRouteLeaves, markSupportEntryReplace } from "@/lib/support/deliver-support-open";

/**
 * Compatibility deep-link alias only — not primary product entry.
 * Auth restore → 주소 정리(router.replace) → 정리된 주소에서 창 열기 (C-21: 먼저 열면 ◁ 가 이 주소로 돌아와 다시 열린다).
 */
export function SupportCaseBootstrapClient({ caseId }: { caseId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const id = caseId.trim();
    if (!id) {
      /** 빈 문의 id — 무한 로딩 대신 고객센터로 (막다른 화면 금지) */
      router.replace("/mypage/customer-center");
      return;
    }

    const finish = () => {
      if (cancelled) return;
      // 창은 주소가 바뀐 뒤 호스트가 연다(flushSupportOpenAfterRoute)
      deliverSupportOpenAfterRouteLeaves(window.location.pathname, { caseId: id, source: "bootstrap" });
      // 고객센터 흐름의 주소 정리 — 호스트가 「경로 바뀜」으로 창을 닫지 않게 표시하고 replace
      markSupportEntryReplace();
      router.replace("/");
    };

    if (getSessionPhase() === "authenticated") {
      finish();
      return;
    }

    void (async () => {
      await ensureSessionHealthy("support_case_bootstrap");
      finish();
    })();

    return () => {
      cancelled = true;
    };
  }, [caseId, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-sam-app px-4 py-8">
      {/* 최종 점검 U6: 글자 대신 DIBAY 스피너 */}
      <DibayPendingSpinner layout="inline" />
    </div>
  );
}

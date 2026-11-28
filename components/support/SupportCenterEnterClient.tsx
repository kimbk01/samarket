"use client";

import { Sam } from "@/lib/ui/sam-component-classes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  clearPendingSupportContext,
  readPendingSupportContext,
} from "@/lib/support/open-support-center";
import { canDeliverSupportOpen, deliverSupportOpenAfterRouteLeaves } from "@/lib/support/deliver-support-open";
import { supportContextFromEnterQuery } from "@/lib/support/support-enter-href";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";
import type { MessageKey } from "@/lib/i18n/messages";

type EnterError = "missing_context" | "open_failed";

/** 최종 점검 U6: 오류 코드마다 맞는 문구 */
export const SUPPORT_ENTER_ERROR_KEYS: Record<EnterError, MessageKey> = {
  missing_context: "support_enter_missing_context",
  open_failed: "support_enter_open_failed",
};

/**
 * Cold-start bootstrap alias only — leaves enter route, then the host opens Support Modal on the new route.
 */
export function SupportCenterEnterClient() {
  const { safeT } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<EnterError | null>(null);

  useEffect(() => {
    // 세션 맥락 우선, 없으면 알림 링크 쿼리 (`buildSupportEnterHref`)
    const context =
      readPendingSupportContext() ??
      supportContextFromEnterQuery(typeof window === "undefined" ? null : new URLSearchParams(window.location.search));
    if (!context) {
      setError("missing_context");
      return;
    }
    clearPendingSupportContext();
    if (!canDeliverSupportOpen({ context, source: "enter" })) {
      setError("open_failed");
      return;
    }
    // C-21: 주소를 먼저 정리하고, 정리된 주소에서 호스트가 창을 연다(◁ 가 이 주소로 돌아와 다시 열리는 반복 방지)
    deliverSupportOpenAfterRouteLeaves(window.location.pathname, { context, source: "enter" });
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-sam-app px-4 py-8">
      {error ? (
        <>
          <p className="text-center text-sm text-sam-muted" data-support-enter-error={error}>
            {safeT(SUPPORT_ENTER_ERROR_KEYS[error])}
          </p>
          {/* 막다른 화면 금지 — 고객센터로 나가는 CTA */}
          <button
            type="button"
            className={`${Sam.btn.secondary} mt-4`}
            onClick={() => router.replace("/mypage/customer-center")}
          >
            {safeT("mypage_hub_support")}
          </button>
        </>
      ) : (
        /* 최종 점검 U6: 글자 대신 DIBAY 스피너(문의 창과 같은 대기 모양) */
        <DibayPendingSpinner layout="inline" />
      )}
    </div>
  );
}

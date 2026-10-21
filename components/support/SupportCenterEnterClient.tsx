"use client";

import { Sam } from "@/lib/ui/sam-component-classes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  clearPendingSupportContext,
  readPendingSupportContext,
} from "@/lib/support/open-support-center";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import { supportContextFromEnterQuery } from "@/lib/support/support-enter-href";

/**
 * Cold-start bootstrap alias only — opens Support Modal, then leaves enter route.
 */
export function SupportCenterEnterClient() {
  const { safeT } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 세션 맥락 우선, 없으면 알림 링크 쿼리 (`buildSupportEnterHref`)
    const context =
      readPendingSupportContext() ??
      supportContextFromEnterQuery(typeof window === "undefined" ? null : new URLSearchParams(window.location.search));
    if (!context) {
      setError("missing_context");
      return;
    }
    const delivered = deliverSupportOpen({ context, source: "enter" });
    clearPendingSupportContext();
    if (!delivered.ok) {
      setError("open_failed");
      return;
    }
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-sam-app px-4 py-8">
      {error ? (
        <>
          <p className="text-center text-sm text-sam-muted">
            {safeT("support_enter_missing_context", {
              fallbackKo: "문의 정보를 불러올 수 없습니다. 다시 시도해 주세요.",
              fallbackEn: "Could not load inquiry context. Please try again.",
            })}
          </p>
          {/* 막다른 화면 금지 — 고객센터로 나가는 CTA */}
          <button
            type="button"
            className={`${Sam.btn.secondary} mt-4`}
            onClick={() => router.replace("/mypage/customer-center")}
          >
            {safeT("mypage_hub_support", { fallbackKo: "고객센터", fallbackEn: "Customer center" })}
          </button>
        </>
      ) : (
        <p className="text-sm text-sam-muted">
          {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      )}
    </div>
  );
}

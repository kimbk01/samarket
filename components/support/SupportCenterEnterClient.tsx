"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  clearPendingSupportContext,
  readPendingSupportContext,
} from "@/lib/support/open-support-center";
import { openSupportModal } from "@/lib/support/support-modal-controller";

/**
 * Cold-start bootstrap only — opens Support Modal on shell, then leaves enter route.
 * Does not create a case until user taps 문의하기 in the modal.
 */
export function SupportCenterEnterClient() {
  const { safeT } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const context = readPendingSupportContext();
    if (!context) {
      setError("missing_context");
      return;
    }
    const ok = openSupportModal({ context });
    clearPendingSupportContext();
    if (!ok) {
      setError("open_failed");
      return;
    }
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-sam-app px-4 py-8">
      {error ? (
        <p className="text-center text-sm text-sam-muted">
          {safeT("support_enter_missing_context", {
            fallbackKo: "문의 정보를 불러올 수 없습니다. 다시 시도해 주세요.",
            fallbackEn: "Could not load inquiry context. Please try again.",
          })}
          {error !== "missing_context" ? ` (${error})` : ""}
        </p>
      ) : (
        <p className="text-sm text-sam-muted">
          {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { stashSupportModalRestoreCaseId } from "@/lib/support/open-support-center";
import { openSupportModal } from "@/lib/support/support-modal-controller";

/**
 * Cold-start / deeplink bootstrap — restore Support Modal for case, leave full-page route.
 */
export function SupportCaseBootstrapClient({ caseId }: { caseId: string }) {
  const { safeT } = useI18n();
  const router = useRouter();

  useEffect(() => {
    const id = caseId.trim();
    if (!id) return;
    const opened = openSupportModal({ caseId: id });
    if (!opened) {
      stashSupportModalRestoreCaseId(id);
    }
    router.replace("/");
  }, [caseId, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-sam-app px-4 py-8">
      <p className="text-sm text-sam-muted">
        {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    </div>
  );
}

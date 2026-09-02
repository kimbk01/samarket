"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ensureSessionHealthy } from "@/lib/auth/dibay-session-manager";
import { stashSupportModalRestoreCaseId } from "@/lib/support/open-support-center";
import { openSupportModal } from "@/lib/support/support-modal-controller";

/**
 * A2-3 cold-start / deeplink bootstrap —
 * auth restore first, then Support Modal for exact case, leave full-page route.
 * Session token lifecycle / CUT B is out of scope.
 */
export function SupportCaseBootstrapClient({ caseId }: { caseId: string }) {
  const { safeT } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const id = caseId.trim();
    if (!id) return;

    void (async () => {
      // Avoid opening modal / case fetch before session cookies are restored.
      await ensureSessionHealthy("support_case_bootstrap");
      if (cancelled) return;

      const opened = openSupportModal({ caseId: id });
      if (!opened) {
        stashSupportModalRestoreCaseId(id);
      }
      // Leave bootstrap URL so back does not re-enter full-page residue.
      router.replace("/");
    })();

    return () => {
      cancelled = true;
    };
  }, [caseId, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-sam-app px-4 py-8">
      <p className="text-sm text-sam-muted">
        {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    </div>
  );
}

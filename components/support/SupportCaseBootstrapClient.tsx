"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ensureSessionHealthy,
  getSessionPhase,
} from "@/lib/auth/dibay-session-manager";
import { stashSupportModalRestoreCaseId } from "@/lib/support/open-support-center";
import { openSupportModal } from "@/lib/support/support-modal-controller";

/**
 * A2-3 cold-start / deeplink bootstrap —
 * auth restore first, then Support Modal for exact case, leave full-page route.
 * Session token lifecycle / CUT B is out of scope.
 *
 * When session is already authenticated (warm push / in-app), open the modal
 * immediately — do not wait on a second ensureSessionHealthy round-trip.
 */
export function SupportCaseBootstrapClient({ caseId }: { caseId: string }) {
  const { safeT } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const id = caseId.trim();
    if (!id) return;

    const finish = (opened: boolean) => {
      if (cancelled) return;
      if (!opened) {
        stashSupportModalRestoreCaseId(id);
      }
      // Leave bootstrap URL so back does not re-enter full-page residue.
      router.replace("/");
    };

    // Warm path: modal first, then leave the bootstrap page (no auth wait).
    if (getSessionPhase() === "authenticated") {
      const opened = openSupportModal({ caseId: id });
      finish(opened);
      return;
    }

    void (async () => {
      await ensureSessionHealthy("support_case_bootstrap");
      if (cancelled) return;
      const opened = openSupportModal({ caseId: id });
      finish(opened);
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

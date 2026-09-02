"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ensureSessionHealthy,
  getSessionPhase,
} from "@/lib/auth/dibay-session-manager";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";

/**
 * Compatibility deep-link alias only — not primary product entry.
 * Auth restore → deliverSupportOpen → leave full-page route.
 */
export function SupportCaseBootstrapClient({ caseId }: { caseId: string }) {
  const { safeT } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const id = caseId.trim();
    if (!id) return;

    const finish = () => {
      if (cancelled) return;
      router.replace("/");
    };

    if (getSessionPhase() === "authenticated") {
      deliverSupportOpen({ caseId: id, source: "bootstrap" });
      finish();
      return;
    }

    void (async () => {
      await ensureSessionHealthy("support_case_bootstrap");
      if (cancelled) return;
      deliverSupportOpen({ caseId: id, source: "bootstrap" });
      finish();
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

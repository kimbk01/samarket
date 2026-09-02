"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  clearPendingSupportContext,
  readPendingSupportContext,
} from "@/lib/support/open-support-center";
import { buildSupportCaseRoute } from "@/lib/support/support-case-types";

/**
 * Support Center entry — reads UX handoff context, opens server case, redirects to conversation.
 * sessionStorage is NOT authorization; server validates identity on POST /api/support/cases/open.
 */
export function SupportCenterEnterClient() {
  const { safeT } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const context = readPendingSupportContext();
      if (!context) {
        if (!cancelled) setError("missing_context");
        return;
      }
      try {
        const res = await fetch("/api/support/cases/open", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          case?: { id: string };
          error?: string;
        };
        if (!res.ok || !json.ok || !json.case?.id) {
          if (!cancelled) setError(json.error ?? "open_failed");
          return;
        }
        clearPendingSupportContext();
        if (!cancelled) {
          router.replace(buildSupportCaseRoute(json.case.id));
        }
      } catch {
        if (!cancelled) setError("network_error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT("support_enter_title", {
          fallbackKo: "고객센터",
          fallbackEn: "Customer support",
        })}
        backHref="/mypage"
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
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
    </div>
  );
}

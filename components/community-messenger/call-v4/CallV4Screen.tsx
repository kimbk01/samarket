"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

type CallV4ScreenProps = {
  callId: string;
};

/**
 * V4 Telegram Lane call screen — Phase 1: connecting UI only, no early exit.
 * PATCH / Agora / terminal cleanup are Phase 2+.
 */
export function CallV4Screen({ callId }: CallV4ScreenProps) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const source = searchParams?.get("source")?.trim() ?? null;

  useEffect(() => {
    if (!callId) return;
    logCallV4("screen_mounted", { callId, source });
  }, [callId, source]);

  useEffect(() => {
    if (!callId) return;
    logCallV4("connecting_visible", { callId, source });
  }, [callId, source]);

  const statusLabel = safeT("cm_ui_connecting", {
    fallbackKo: "연결 중",
    fallbackEn: "Connecting",
  });

  return (
    <div
      data-testid="call-v4-screen"
      className="flex min-h-dvh flex-col items-center justify-center bg-sam-app px-6 text-sam-fg"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-8 shadow-sm">
        <p className="text-lg font-semibold">{statusLabel}</p>
        <p className="text-sm text-sam-muted-fg">
          {safeT("cm_ui_call_active_voice", {
            fallbackKo: "통화 중",
            fallbackEn: "On a call",
          })}
        </p>
      </div>
    </div>
  );
}

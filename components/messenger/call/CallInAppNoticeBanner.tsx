"use client";

import { AlertTriangle, Info, PhoneOff, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallInAppNoticeStore } from "@/lib/community-messenger/stores/call-in-app-notice-store";
import type { CallInAppNoticeSeverity } from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import {
  CALL_IN_APP_NOTICE_ERROR_BG_CLASS,
  CALL_IN_APP_NOTICE_ERROR_BORDER_CLASS,
  CALL_IN_APP_NOTICE_HEIGHT_CLASS,
  CALL_IN_APP_NOTICE_INFO_BG_CLASS,
  CALL_IN_APP_NOTICE_INFO_BORDER_CLASS,
  CALL_IN_APP_NOTICE_PAD_X_CLASS,
  CALL_IN_APP_NOTICE_RADIUS_CLASS,
  CALL_IN_APP_NOTICE_SHADOW_CLASS,
  CALL_IN_APP_NOTICE_TERMINAL_BG_CLASS,
  CALL_IN_APP_NOTICE_TERMINAL_BORDER_CLASS,
  CALL_IN_APP_NOTICE_TOP_CLASS,
  CALL_IN_APP_NOTICE_WARN_BG_CLASS,
  CALL_IN_APP_NOTICE_WARN_BORDER_CLASS,
  CALL_IN_APP_NOTICE_Z_CLASS,
} from "@/lib/community-messenger/call-ui/incoming-call-banner-tokens";

/**
 * Canonical Web renderer for DIBAY Call in-app notice.
 * Geometry/token family shared with IncomingCallBanner (establishment stays separate).
 */
export function CallInAppNoticeBanner() {
  const { safeT } = useI18n();
  const current = useCallInAppNoticeStore((s) => s.current);
  const dismiss = useCallInAppNoticeStore((s) => s.dismiss);

  if (!current) return null;

  const { severity } = current.spec;
  const surface = surfaceClasses(severity);
  const Icon = iconFor(severity);
  const dismissLabel = safeT("common_close", { fallbackKo: "닫기", fallbackEn: "Close" });

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 ${CALL_IN_APP_NOTICE_TOP_CLASS} ${CALL_IN_APP_NOTICE_Z_CLASS} ${CALL_IN_APP_NOTICE_PAD_X_CLASS} sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2`}
      data-testid="call-in-app-notice"
      data-call-in-app-notice-event={current.event}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto mx-auto flex ${CALL_IN_APP_NOTICE_HEIGHT_CLASS} max-w-[520px] items-center gap-2.5 border ${CALL_IN_APP_NOTICE_RADIUS_CLASS} ${CALL_IN_APP_NOTICE_SHADOW_CLASS} px-3 py-2.5 text-white animate-dibay-incoming-pill-enter ${surface}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight">{current.message}</p>
        {current.spec.dismissible ? (
          <button
            type="button"
            onClick={() => dismiss(current.event)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/90 transition-transform active:scale-95"
            aria-label={dismissLabel}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function surfaceClasses(severity: CallInAppNoticeSeverity): string {
  switch (severity) {
    case "TERMINAL":
      return `${CALL_IN_APP_NOTICE_TERMINAL_BG_CLASS} ${CALL_IN_APP_NOTICE_TERMINAL_BORDER_CLASS}`;
    case "ERROR":
    case "ACTION_REQUIRED":
      return `${CALL_IN_APP_NOTICE_ERROR_BG_CLASS} ${CALL_IN_APP_NOTICE_ERROR_BORDER_CLASS}`;
    case "WARNING":
      return `${CALL_IN_APP_NOTICE_WARN_BG_CLASS} ${CALL_IN_APP_NOTICE_WARN_BORDER_CLASS}`;
    case "PROGRESS":
    case "INFORMATION":
    default:
      return `${CALL_IN_APP_NOTICE_INFO_BG_CLASS} ${CALL_IN_APP_NOTICE_INFO_BORDER_CLASS}`;
  }
}

function iconFor(severity: CallInAppNoticeSeverity) {
  switch (severity) {
    case "TERMINAL":
      return PhoneOff;
    case "ERROR":
      return AlertTriangle;
    case "ACTION_REQUIRED":
      return ShieldAlert;
    case "WARNING":
      return AlertTriangle;
    case "PROGRESS":
      return RefreshCw;
    case "INFORMATION":
    default:
      return Info;
  }
}

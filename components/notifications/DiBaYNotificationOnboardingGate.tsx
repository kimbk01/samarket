"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import {
  readDiBaYNotificationPromptState,
  shouldOfferDiBaYNotificationPrePrompt,
  writeDiBaYNotificationPromptState,
} from "@/lib/notifications/dibay-notification-prompt-storage";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";

function isAuthExcludedPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/signup" ||
    path.startsWith("/signup/") ||
    path.startsWith("/auth/")
  );
}

/**
 * 최초 로그인 후 1회: 디바이 안내 모달 → 사용자가 "알림 받기" 선택 시에만 Notification.requestPermission.
 * POST_NOTIFICATIONS(iOS/Android PWA)는 브라우저/OS가 처리 — 거부 시 재요청하지 않음.
 */
export function DiBaYNotificationOnboardingGate() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownRef = useRef(false);

  const tryOpen = useCallback(() => {
    if (typeof window === "undefined") return;
    if (isAuthExcludedPath(pathname)) return;
    if (!getSupabaseProfileCache()?.id) return;
    if (!shouldOfferDiBaYNotificationPrePrompt()) return;
    if (shownRef.current) return;
    if (!("Notification" in window)) return;
    const perm = Notification.permission;
    if (perm === "granted") {
      writeDiBaYNotificationPromptState("accepted");
      return;
    }
    if (perm === "denied") {
      writeDiBaYNotificationPromptState("browser_denied");
      return;
    }
    const run = () => {
      if (readDiBaYNotificationPromptState() != null) return;
      shownRef.current = true;
      setOpen(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 900 });
    } else {
      window.setTimeout(run, 480);
    }
  }, [pathname]);

  useEffect(() => {
    const t = window.setTimeout(() => tryOpen(), 200);
    return () => window.clearTimeout(t);
  }, [tryOpen]);

  const onLater = () => {
    writeDiBaYNotificationPromptState("declined");
    setOpen(false);
  };

  const onAccept = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        writeDiBaYNotificationPromptState("browser_denied");
        setOpen(false);
        return;
      }
      writeDiBaYNotificationPromptState("accepted");
      const reg = await registerWebPushSubscriptionFromClient();
      if (!reg.ok && process.env.NODE_ENV === "development") {
        console.info("[DiBaYNotificationOnboarding] push register", reg);
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-notif-onboard-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <p id="dibay-notif-onboard-title" className="sam-text-body font-semibold text-sam-fg">
          디바이 알림을 받을까요?
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          채팅, 거래, 주문, 공지 알림을 받을 수 있습니다.
        </p>
        <p className="mt-3 text-[11px] leading-snug text-sam-muted">
          광고/이벤트 알림은 내정보에서 별도 설정할 수 있습니다.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            나중에
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAccept()}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white"
          >
            {busy ? "처리 중…" : "알림 받기"}
          </button>
        </div>
      </div>
    </div>
  );
}

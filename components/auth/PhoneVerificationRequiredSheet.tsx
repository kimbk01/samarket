"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  profileGatePrimaryBtnClass,
  profileGateSecondaryBtnClass,
} from "@/components/auth/ProfileGateAlertDialog";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import {
  DIBAY_PHONE_VERIFICATION_REQUIRED_DISMISS_EVENT,
  DIBAY_PHONE_VERIFICATION_REQUIRED_EVENT,
  type PhoneVerificationRequiredDetail,
} from "@/lib/auth/phone-verification-required-client";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

/**
 * 전화번호 미인증 API 거부 시 — 하단 바텀시트(하단 탭 위·배경 딤 없음).
 */
export function PhoneVerificationRequiredSheet() {
  const { safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [detail, setDetail] = useState<PhoneVerificationRequiredDetail | null>(null);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const prevPathnameRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const close = useCallback(() => {
    setEntered(false);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setDetail(null);
    }, 200);
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const ce = event as CustomEvent<PhoneVerificationRequiredDetail>;
      setDetail(ce.detail ?? {});
    };
    window.addEventListener(DIBAY_PHONE_VERIFICATION_REQUIRED_EVENT, onRequired as EventListener);
    return () =>
      window.removeEventListener(DIBAY_PHONE_VERIFICATION_REQUIRED_EVENT, onRequired as EventListener);
  }, []);

  useEffect(() => {
    const onDismiss = () => close();
    window.addEventListener(DIBAY_PHONE_VERIFICATION_REQUIRED_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(DIBAY_PHONE_VERIFICATION_REQUIRED_DISMISS_EVENT, onDismiss);
  }, [close]);

  useEffect(() => {
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname;
      return;
    }
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!detail) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [detail]);

  const goVerify = useCallback(() => {
    const next =
      detail?.next?.trim() ||
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/community-messenger");
    router.push(buildPhoneVerificationHref(next));
    close();
  }, [close, detail?.next, router]);

  if (!mounted || !detail || typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      className={`fixed inset-x-0 bottom-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS} pointer-events-none`}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="phone-verification-required-title"
        aria-describedby="phone-verification-required-desc"
        className={`pointer-events-auto w-full rounded-t-[20px] border border-b-0 border-sam-border bg-sam-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <h2 id="phone-verification-required-title" className="text-center text-lg font-semibold text-sam-fg">
          {safeT("auth_phone_gate_unverified_title", {
            fallbackKo: "전화번호 인증이 완료되지 않았습니다",
            fallbackEn: "Phone verification is not complete",
          })}
        </h2>
        <p
          id="phone-verification-required-desc"
          className="mt-2 text-center sam-text-body leading-relaxed text-sam-muted"
        >
          {safeT("auth_phone_gate_messenger_action_body", {
            fallbackKo: "메시지 전송 등 이 기능을 사용하려면 전화번호 인증이 필요합니다. 인증 후 다시 시도해 주세요.",
            fallbackEn:
              "Phone verification is required to send messages and use this feature. Verify your number and try again.",
          })}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={goVerify} className={profileGatePrimaryBtnClass}>
            {safeT("auth_phone_gate_verify", {
              fallbackKo: "전화 인증하기",
              fallbackEn: "Verify phone",
            })}
          </button>
          <button type="button" onClick={close} className={profileGateSecondaryBtnClass}>
            {safeT("auth_login_required_later", {
              fallbackKo: "나중에 하기",
              fallbackEn: "Later",
            })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

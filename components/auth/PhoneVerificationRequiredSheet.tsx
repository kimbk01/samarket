"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import {
  DIBAY_PHONE_VERIFICATION_REQUIRED_DISMISS_EVENT,
  DIBAY_PHONE_VERIFICATION_REQUIRED_EVENT,
  type PhoneVerificationRequiredDetail,
} from "@/lib/auth/phone-verification-required-client";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/**
 * 전화번호 미인증 API 거부 시 — 하단 바텀시트(하단 탭 위).
 */
export function PhoneVerificationRequiredSheet() {
  const { safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [detail, setDetail] = useState<PhoneVerificationRequiredDetail | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  const close = useCallback(() => {
    setDetail(null);
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

  const goVerify = useCallback(() => {
    const next =
      detail?.next?.trim() ||
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/community-messenger");
    router.push(buildPhoneVerificationHref(next));
    close();
  }, [close, detail?.next, router]);

  return (
    <DibayBottomSheet
      open={Boolean(detail)}
      onClose={close}
      title={safeT("auth_phone_gate_unverified_title", {
        fallbackKo: "전화번호 인증이 완료되지 않았습니다",
        fallbackEn: "Phone verification is not complete",
      })}
      anchor="above-bottom-nav"
      showHandle={false}
    >
      <p className={`text-center ${OverlayUi.bodySecondary}`}>
        {safeT("auth_phone_gate_messenger_action_body", {
          fallbackKo: "메시지 전송 등 이 기능을 사용하려면 전화번호 인증이 필요합니다. 인증 후 다시 시도해 주세요.",
          fallbackEn:
            "Phone verification is required to send messages and use this feature. Verify your number and try again.",
        })}
      </p>
      <div className={`${OverlayUi.actionsStack} mt-5`}>
        <DibayOverlayButton roleTone="primary" onClick={goVerify}>
          {safeT("auth_phone_gate_verify", {
            fallbackKo: "전화 인증하기",
            fallbackEn: "Verify phone",
          })}
        </DibayOverlayButton>
        <DibayOverlayButton roleTone="secondary" onClick={close}>
          {safeT("auth_login_required_later", {
            fallbackKo: "나중에 하기",
            fallbackEn: "Later",
          })}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}

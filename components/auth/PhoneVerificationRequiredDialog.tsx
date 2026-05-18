"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  SAMARKET_PHONE_VERIFICATION_REQUIRED_EVENT,
  type PhoneVerificationRequiredDetail,
} from "@/lib/auth/phone-verification-gate-client";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";

/**
 * 전역 — `openPhoneVerificationRequiredDialog` / `ensureClientAccessOrRedirect` 전화 분기에서 표시.
 * z-index: 주소 게이트(110) 위.
 */
export function PhoneVerificationRequiredDialog() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [nextPath, setNextPath] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onReq = (ev: Event) => {
      const ce = ev as CustomEvent<PhoneVerificationRequiredDetail>;
      const next = typeof ce.detail?.next === "string" && ce.detail.next.trim() ? ce.detail.next.trim() : undefined;
      setNextPath(next);
      setOpen(true);
    };
    window.addEventListener(SAMARKET_PHONE_VERIFICATION_REQUIRED_EVENT, onReq as EventListener);
    return () => window.removeEventListener(SAMARKET_PHONE_VERIFICATION_REQUIRED_EVENT, onReq as EventListener);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setNextPath(undefined);
  }, []);

  const goVerify = useCallback(() => {
    const n = nextPath ?? `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    router.push(buildPhoneVerificationHref(n));
    close();
  }, [router, pathname, nextPath, close]);

  if (!open) return null;

  const requirement = t("auth_phone_gate_requirement");

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
      aria-describedby="phone-gate-desc"
    >
      <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-ui-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-xl sm:rounded-ui-rect sm:p-6">
        <h2 id="phone-gate-title" className="sam-text-section-title font-semibold text-ui-fg">
          {t("auth_phone_gate_title")}
        </h2>
        <p id="phone-gate-desc" className="mt-2 sam-text-body leading-relaxed text-ui-muted">
          {t("auth_phone_gate_body", { requirement })}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={goVerify}
            className="w-full rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white"
          >
            {t("auth_phone_gate_verify")}
          </button>
          <button
            type="button"
            onClick={close}
            className="w-full rounded-ui-rect border border-ui-border bg-transparent py-3 sam-text-body font-medium text-ui-fg"
          >
            {t("common_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

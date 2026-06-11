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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
      aria-describedby="phone-gate-desc"
    >
      <div className="w-full max-w-md max-h-[min(88dvh,640px)] overflow-y-auto overscroll-y-contain rounded-[24px] border border-[#d9e5df] bg-white px-5 py-5 shadow-2xl sm:p-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#006241]/10 text-[#006241]" aria-hidden>
          <span className="text-xl font-bold">P</span>
        </div>
        <h2 id="phone-gate-title" className="mt-3 text-center text-lg font-semibold text-[#1e3932]">
          {t("auth_phone_gate_title")}
        </h2>
        <p id="phone-gate-desc" className="mt-2 text-center sam-text-body leading-relaxed text-[#1e3932]/75">
          {t("auth_phone_gate_body", { requirement })}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={goVerify}
            className="w-full rounded-full bg-[#006241] px-4 py-3 sam-text-body font-semibold text-white active:bg-[#1e3932]"
          >
            {t("auth_phone_gate_verify")}
          </button>
          <button
            type="button"
            onClick={close}
            className="w-full rounded-full border border-[#006241] bg-white px-4 py-3 sam-text-body font-semibold text-[#006241] active:bg-[#f6f6f6]"
          >
            {t("common_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

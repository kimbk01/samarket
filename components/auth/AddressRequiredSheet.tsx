"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DIBAY_ADDRESS_REQUIRED_EVENT,
  type AddressRequiredDetail,
} from "@/lib/auth/require-auth-action";

export function AddressRequiredSheet() {
  const { t } = useI18n();
  const router = useRouter();
  const [detail, setDetail] = useState<AddressRequiredDetail | null>(null);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const ce = event as CustomEvent<AddressRequiredDetail>;
      setDetail(ce.detail ?? null);
    };
    window.addEventListener(DIBAY_ADDRESS_REQUIRED_EVENT, onRequired as EventListener);
    return () => window.removeEventListener(DIBAY_ADDRESS_REQUIRED_EVENT, onRequired as EventListener);
  }, []);

  const close = useCallback(() => setDetail(null), []);

  const goAddress = useCallback(() => {
    const next = detail?.next?.trim();
    const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
    router.push(`/mypage/addresses${suffix}`);
    close();
  }, [close, detail?.next, router]);

  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-[125] flex flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="address-gate-title" aria-describedby="address-gate-desc">
      <div className="w-full max-w-md rounded-t-[24px] border border-[#d9e5df] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-[24px] sm:p-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#006241]/10 text-[#006241]" aria-hidden>
          <span className="text-xl font-bold">A</span>
        </div>
        <h2 id="address-gate-title" className="mt-3 text-center text-lg font-semibold text-[#1e3932]">
          {t("auth_address_gate_title")}
        </h2>
        <p id="address-gate-desc" className="mt-2 text-center sam-text-body leading-relaxed text-[#1e3932]/75">
          {t("auth_address_gate_body")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={goAddress}
            className="w-full rounded-full bg-[#006241] px-4 py-3 sam-text-body font-semibold text-white active:bg-[#1e3932]"
          >
            {t("auth_address_gate_cta")}
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

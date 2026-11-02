"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 휴대망 끊김·복구 안내 — 메신저·거래 전역 체감 품질.
 */
export function WebConnectivityBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.5rem,var(--safe-top))]"
    >
      <div className="pointer-events-auto max-w-lg rounded-full border border-[color:var(--overlay-border)] bg-[color:color-mix(in_srgb,#d4a017_10%,#fff)] px-4 py-2 text-center text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-warning)] shadow-[var(--overlay-elevation-1)]">
        {t("app_connectivity_offline")}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { USER_SETTINGS_SAVE_FAILED_EVENT } from "@/lib/settings/user-settings-store";
import { MYPAGE_TOAST_EVENT, type MypageToastDetail } from "@/lib/mypage/mypage-toast";

const TOAST_MS = 3000;

/**
 * 내정보 토스트 1개 — 하단 탭바 위, 3초.
 * 설정 저장 실패(되돌림)도 여기서 알린다 (D16).
 */
export function MypageToastHost() {
  const { t } = useI18n();
  const [toast, setToast] = useState<MypageToastDetail | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (detail: MypageToastDetail) => {
      setToast(detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), TOAST_MS);
    };
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<MypageToastDetail>).detail;
      if (detail?.message) show(detail);
    };
    const onSettingsFailed = () => show({ message: t("mypage_settings_save_failed_reverted"), tone: "error" });
    window.addEventListener(MYPAGE_TOAST_EVENT, onToast);
    window.addEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, onSettingsFailed);
    return () => {
      window.removeEventListener(MYPAGE_TOAST_EVENT, onToast);
      window.removeEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, onSettingsFailed);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [t]);

  if (!toast) return null;
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      data-testid="mypage-toast"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+var(--safe-bottom,0px))] z-[60] flex justify-center px-4"
    >
      <p
        className={`max-w-md rounded-ui-rect px-4 py-3 text-[14px] font-medium shadow-[var(--sam-shadow-elevated)] ${
          toast.tone === "error" ? "bg-sam-danger text-white" : "bg-sam-fg text-sam-surface"
        }`}
      >
        {toast.message}
      </p>
    </div>
  );
}

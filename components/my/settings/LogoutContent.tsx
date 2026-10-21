"use client";

/**
 * Slice 2 Authority (CTA):
 * - Logout confirm = modal (`LogoutConfirmModal`) only — never push-page confirm.
 * - Allowed Danger variants: `danger_button` | `menu_row` (see `MYPAGE_LOGOUT_DANGER_VARIANTS`).
 * - Forbidden on profile hub chrome: `text_link` | Primary styling.
 * - Slice 3 MOVE: primary hub logout is Account menu (`menu_row`), not profile chrome.
 */

import { useState } from "react";
import { LogoutConfirmModal } from "@/components/auth/LogoutConfirmModal";
import {
  navigateAfterAuthExitOnce,
  runAuthLogoutExit,
} from "@/lib/auth/auth-exit-coordinator";
import { logoutDiBaYAllDevices } from "@/lib/auth/logout";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";
import type { MypageLogoutDangerVariant } from "@/lib/mypage/mypage-authority-contract";

type LogoutActionTriggerProps = {
  /** Prefer Danger kinds on Member surfaces. Profile hub: `danger_button` | `menu_row` only. */
  variant?: MypageLogoutDangerVariant | "outlined_button" | "text_link";
  surface?: "card" | "grouped";
  label?: string;
  autoOpen?: boolean;
  /** 확인 모달 z-index — 기본 다이얼로그 층보다 위 표면에서만 지정 (관리자 가로 가드). */
  confirmZIndexClass?: string;
};

export function LogoutActionTrigger({
  variant = "danger_button",
  surface = "grouped",
  label: labelProp,
  autoOpen = false,
  confirmZIndexClass,
}: LogoutActionTriggerProps) {
  const { t } = useI18n();
  const label = labelProp ?? t("auth_logout_submit");
  const [open, setOpen] = useState(autoOpen);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));

    // Navigation authority: auth-exit-coordinator only (after logout flow).
    // No parallel timeout navigate — local fail-closed runs at logout start.
    try {
      const result = await runAuthLogoutExit();
      setSubmitting((prev) => (prev ? false : prev));

      if (!result.ok) {
        setError(result.message ?? t("auth_logout_err_failed"));
        return;
      }

      setOpen((prev) => (prev ? false : prev));
    } catch (e) {
      setSubmitting((prev) => (prev ? false : prev));
      // 예외 원문은 콘솔로만 (P2-15)
      console.warn("[logout] unexpected failure", e instanceof Error ? e.name : "unknown");
      setError(t("auth_logout_err_unknown"));
    }
  };

  return (
    <>
      {variant === "menu_row" ? (
        <MyPageMobileMenuRow
          title={label}
          tone="danger"
          surface={surface}
          onClick={() => {
            setError((prev) => (prev === null ? prev : null));
            setOpen((prev) => (prev ? prev : true));
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError((prev) => (prev === null ? prev : null));
            setOpen((prev) => (prev ? prev : true));
          }}
          className={
            variant === "text_link"
              ? "shrink-0 text-[13px] font-semibold text-sam-danger underline-offset-2 hover:underline active:opacity-80"
              : variant === "outlined_button"
              ? "w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-medium text-ui-muted transition-transform duration-100 active:scale-[0.985] active:brightness-95"
              : "w-full rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-3 text-center sam-text-body font-semibold text-sam-danger transition-transform duration-100 active:scale-[0.985] active:brightness-95"
          }
        >
          {label}
        </button>
      )}
      <LogoutConfirmModal
        open={open}
        submitting={submitting}
        error={error}
        zIndexClass={confirmZIndexClass}
        onCancel={() => setOpen(false)}
        onConfirm={handleLogout}
      />
    </>
  );
}

function LogoutAllDevicesTrigger() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogoutAll = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await logoutDiBaYAllDevices();
      setSubmitting(false);
      if (!result.ok) {
        setError(result.message ?? t("auth_logout_err_failed"));
        return;
      }
      setOpen(false);
      navigateAfterAuthExitOnce("logout");
    } catch (e) {
      setSubmitting(false);
      console.warn("[logout-all] unexpected failure", e instanceof Error ? e.name : "unknown");
      setError(t("auth_logout_err_failed"));
    }
  };

  return (
    <>
      <MyPageMobileMenuRow
        title={t("auth_logout_all_label")}
        tone="danger"
        surface="grouped"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <LogoutConfirmModal
        open={open}
        submitting={submitting}
        error={error}
        title={t("auth_logout_all_confirm_title")}
        body={t("auth_logout_all_confirm_body")}
        onCancel={() => setOpen(false)}
        onConfirm={handleLogoutAll}
      />
    </>
  );
}

export function LogoutContent() {
  return (
    <div className="space-y-0">
      <LogoutActionTrigger variant="menu_row" />
      <LogoutAllDevicesTrigger />
    </div>
  );
}

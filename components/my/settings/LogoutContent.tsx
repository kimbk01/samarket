"use client";

import { useState } from "react";
import { LogoutConfirmModal } from "@/components/auth/LogoutConfirmModal";
import {
  navigateAfterAuthExitOnce,
  runAuthLogoutExit,
} from "@/lib/auth/auth-exit-coordinator";
import { logoutDiBaYAllDevices } from "@/lib/auth/logout";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";

type LogoutActionTriggerProps = {
  variant?: "danger_button" | "menu_row" | "outlined_button";
  surface?: "card" | "grouped";
  label?: string;
  autoOpen?: boolean;
};

export function LogoutActionTrigger({
  variant = "danger_button",
  surface = "grouped",
  label = "로그아웃",
  autoOpen = false,
}: LogoutActionTriggerProps) {
  const [open, setOpen] = useState(autoOpen);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));

    const safetyForceNavigate = window.setTimeout(() => {
      setSubmitting((prev) => (prev ? false : prev));
      setOpen((prev) => (prev ? false : prev));
      navigateAfterAuthExitOnce("logout");
    }, 6_000);

    try {
      const result = await runAuthLogoutExit();
      window.clearTimeout(safetyForceNavigate);
      setSubmitting((prev) => (prev ? false : prev));

      if (!result.ok) {
        setError(result.message ?? "로그아웃 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      setOpen((prev) => (prev ? false : prev));
    } catch (e) {
      window.clearTimeout(safetyForceNavigate);
      setSubmitting((prev) => (prev ? false : prev));
      setError(e instanceof Error ? e.message : "로그아웃 처리 중 알 수 없는 오류가 발생했습니다.");
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
            variant === "outlined_button"
              ? "w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-medium text-ui-muted transition-transform duration-100 active:scale-[0.985] active:brightness-95"
              : "w-full rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 text-center sam-text-body font-semibold text-red-600 transition-transform duration-100 active:scale-[0.985] active:brightness-95"
          }
        >
          {label}
        </button>
      )}
      <LogoutConfirmModal
        open={open}
        submitting={submitting}
        error={error}
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
      setError(e instanceof Error ? e.message : t("auth_logout_err_failed"));
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

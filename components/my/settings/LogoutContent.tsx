"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutConfirmModal } from "@/components/auth/LogoutConfirmModal";
import { logoutDiBaYAppSession } from "@/lib/auth/logout";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
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
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateAfterLogout = () => {
    if (typeof window !== "undefined") {
      window.location.replace(buildLoginPath());
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  const handleLogout = async () => {
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));

    const safetyForceNavigate = window.setTimeout(() => {
      setSubmitting((prev) => (prev ? false : prev));
      setOpen((prev) => (prev ? false : prev));
      navigateAfterLogout();
    }, 6_000);

    try {
      const result = await logoutDiBaYAppSession();
      window.clearTimeout(safetyForceNavigate);
      setSubmitting((prev) => (prev ? false : prev));

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen((prev) => (prev ? false : prev));
      navigateAfterLogout();
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

export function LogoutContent() {
  return <LogoutActionTrigger />;
}

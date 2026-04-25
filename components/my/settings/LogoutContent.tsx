"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { performClientLogout } from "@/lib/auth/logout-client";
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

  const handleLogout = async () => {
    setSubmitting(true);
    setError(null);
    const result = await performClientLogout();
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setOpen(false);
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      {variant === "menu_row" ? (
        <MyPageMobileMenuRow
          title={label}
          tone="danger"
          surface={surface}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
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
      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
        >
          <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
            <p id="logout-dialog-title" className="sam-text-body font-semibold text-sam-fg">
              로그아웃
            </p>
            <p id="logout-dialog-desc" className="mt-2 sam-text-body-secondary text-sam-muted">
              현재 기기에서 로그인된 계정을 종료합니다. 로그아웃 하시겠습니까?
            </p>
            {error ? <p className="mt-3 sam-text-body-secondary text-red-600">{error}</p> : null}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={submitting}
                className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
              >
                {submitting ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function LogoutContent() {
  return <LogoutActionTrigger />;
}

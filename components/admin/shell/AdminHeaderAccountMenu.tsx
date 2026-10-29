"use client";

/**
 * 상단 고정 영역 「관리자 계정」 (지시서 §6 · 재설계 R8) — 계정 이름(표시 이름 · 로그인 ID)·역할을 1024 폭에서도 보이고,
 * 누르면 계정 메뉴(관리자 계정 관리 · 로그아웃)를 연다. 표준 부품만 쓴다 (`AdminActionLink`).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";

export function AdminHeaderAccountMenu({
  displayName,
  loginId,
  roleLabel,
  canManageStaff,
  languageToggle,
}: {
  displayName: string | null;
  loginId: string | null;
  roleLabel: string | null;
  /** 관리자 계정 관리 화면을 열 수 있는지 (접근표) */
  canManageStaff: boolean;
  /** 언어 전환 — 2단 헤더(감사 UX-03)에서 1단 폭을 줄이려고 계정 메뉴 안으로 옮김 */
  languageToggle?: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDetailsElement | null>(null);
  const name = (displayName ?? "").trim() || (loginId ?? "").trim() || t("admin_shell_account_menu");

  // 바깥 클릭·Esc 로 닫는다
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative shrink-0" data-admin-account-menu="1">
      <summary
        className="flex h-9 max-w-[200px] cursor-pointer list-none items-center gap-1.5 rounded-ui-rect border border-[var(--admin-console-border)] px-2 text-[13px] text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)] [&::-webkit-details-marker]:hidden"
        aria-label={t("admin_shell_account_menu")}
        title={[name, loginId, roleLabel].filter(Boolean).join(" · ")}
      >
        <span className="min-w-0 truncate font-semibold" data-admin-account-name="1">
          {name}
        </span>
        {roleLabel ? (
          <span className="shrink-0 text-[12px] text-[var(--admin-console-muted)]" data-admin-account-role="1">
            {roleLabel}
          </span>
        ) : null}
        <span aria-hidden className="shrink-0 text-[12px] text-[var(--admin-console-muted)]">
          ▾
        </span>
      </summary>
      <div
        role="menu"
        className="absolute right-0 z-50 mt-1 w-60 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] p-2 shadow-lg"
      >
        <div className="border-b border-[var(--admin-console-border)] px-1 pb-2">
          <p className="truncate text-[14px] font-semibold text-[var(--admin-console-fg)]">{name}</p>
          {loginId ? <p className="truncate text-[12px] text-[var(--admin-console-muted)]">{loginId}</p> : null}
          {roleLabel ? <p className="text-[12px] text-[var(--admin-console-muted)]">{roleLabel}</p> : null}
        </div>
        <div className="flex flex-col items-stretch gap-1 pt-2">
          {languageToggle ? (
            <div className="px-1 py-1" data-admin-account-language="1">
              {languageToggle}
            </div>
          ) : null}
          <AdminActionLink href="/philife" variant="neutral" size="sm" role="menuitem">
            {t("common_homepage")}
          </AdminActionLink>
          {canManageStaff ? (
            <AdminActionLink href="/admin/staff" variant="neutral" size="sm" role="menuitem">
              {t("admin_shell_account_staff")}
            </AdminActionLink>
          ) : null}
          <div className="px-1 py-1 text-[13px]" role="menuitem">
            <LogoutActionTrigger variant="text_link" label={t("admin_landscape_guard_logout")} />
          </div>
        </div>
      </div>
    </details>
  );
}

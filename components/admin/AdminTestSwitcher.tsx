"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRoleLabel } from "@/lib/admin-users/admin-role-labels";
import type { AdminStaff } from "@/lib/types/admin-staff";
import {
  getCurrentAdminLoginIdForDisplay,
  setAdminTestLoginAndReload,
} from "@/lib/admin-permission";

/**
 * 개발용 관리자 디렉터리 표시.
 * 선택값은 UI 메모일 뿐이며 역할·권한은 항상 `/api/admin/me` snapshot을 따른다.
 */
export function AdminTestSwitcher() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<AdminStaff[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const displayLoginId = getCurrentAdminLoginIdForDisplay();

  useEffect(() => {
    setCurrentId(displayLoginId);
  }, [displayLoginId]);

  useEffect(() => {
    void fetch("/api/admin/staff", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; staff?: AdminStaff[] }) => {
        if (j.ok && Array.isArray(j.staff)) setStaffList(j.staff);
      })
      .catch(() => setStaffList([]));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const show =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PUBLIC_ADMIN_TEST_SWITCHER === "true";

  if (!show) return null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 sam-text-helper text-amber-800 hover:bg-amber-100"
        title={t("admin_test_switcher_title")}
      >
        <span className="font-medium">
          {currentId
            ? t("admin_test_switcher_label", { id: currentId })
            : t("admin_test_switcher_inactive")}
        </span>
        <span className="text-amber-600">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-sam-border bg-sam-surface py-1 shadow-sam-elevated">
          <div className="border-b border-sam-border-soft px-2 py-1.5 sam-text-xxs text-sam-muted">
            {t("admin_test_switcher_menu_hint")}
          </div>
          <button
            type="button"
            onClick={() => {
              setAdminTestLoginAndReload(null);
              setOpen(false);
            }}
            className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
          >
            {t("admin_test_switcher_env_option")}
          </button>
          {staffList.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setAdminTestLoginAndReload(s.loginId);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left sam-text-body-secondary hover:bg-sam-app ${
                currentId === s.loginId
                  ? "bg-amber-50 font-medium text-amber-900"
                  : "text-sam-fg"
              }`}
            >
              <span className="font-medium">{s.loginId}</span>
              <span className="ml-1.5 text-sam-muted">({getRoleLabel(s.role)})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { getAdminStaffList } from "@/lib/admin-users/mock-admin-staff";
import { getRoleLabel } from "@/lib/admin-users/mock-admin-staff";
import {
  getCurrentAdminLoginIdForDisplay,
  setAdminTestLoginAndReload,
} from "@/lib/admin-permission";

/**
 * 수동 관리자 테스트용: 로그인할 관리자(아이디)를 선택하면
 * getAdminRole() / getCurrentAdminStaff() 가 해당 관리자 기준으로 동작합니다.
 * NEXT_PUBLIC_ADMIN_TEST_SWITCHER=true 또는 개발 시 노출 권장.
 */
export function AdminTestSwitcher() {
  const [open, setOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const staffList = getAdminStaffList();
  const displayLoginId = getCurrentAdminLoginIdForDisplay();

  useEffect(() => {
    setCurrentId(displayLoginId);
  }, [displayLoginId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const show =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ADMIN_TEST_SWITCHER === "true";

  if (!show) return null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800 hover:bg-amber-100"
        title="테스트: 로그인할 관리자 전환"
      >
        <span className="font-medium">
          테스트: {currentId ? `${currentId}` : "env 기본"}
        </span>
        <span className="text-amber-600">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-sam-border bg-sam-surface py-1 shadow-lg">
          <div className="border-b border-sam-border-soft px-2 py-1.5 text-[11px] text-sam-muted">
            수동 관리자로 로그인 전환 (새로고침)
          </div>
          <button
            type="button"
            onClick={() => {
              setAdminTestLoginAndReload(null);
              setOpen(false);
            }}
            className="block w-full px-3 py-2 text-left text-[13px] text-sam-fg hover:bg-sam-app"
          >
            env 기본 (NEXT_PUBLIC_ADMIN_ROLE)
          </button>
          {staffList.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setAdminTestLoginAndReload(s.loginId);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-sam-app ${
                currentId === s.loginId ? "bg-amber-50 font-medium text-amber-900" : "text-sam-fg"
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

"use client";

import { useState, useCallback, useEffect } from "react";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { updateAdminStaff, getAdminStaffById } from "@/lib/admin-users/mock-admin-staff";
import { getAdminRole } from "@/lib/admin-permission";
import { AdminPermissionToggles } from "./AdminPermissionToggles";

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "operator", label: "운영자" },
  { value: "manager", label: "총괄" },
  { value: "master", label: "최고 관리자" },
];

interface EditAdminFormProps {
  staffId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditAdminForm({ staffId, onClose, onSuccess }: EditAdminFormProps) {
  const staff = getAdminStaffById(staffId);
  const [displayName, setDisplayName] = useState(staff?.displayName ?? "");
  const [role, setRole] = useState<AdminRole>(staff?.role ?? "operator");
  const [permissions, setPermissions] = useState<AdminPermissionKey[]>(staff?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const s = getAdminStaffById(staffId);
    if (s) {
      setDisplayName(s.displayName);
      setRole(s.role);
      setPermissions([...s.permissions]);
    }
  }, [staffId]);

  const togglePermission = useCallback((key: AdminPermissionKey) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }, []);

  const handleApplyRoleDefaults = useCallback((r: AdminRole) => {
    setPermissions(DEFAULT_PERMISSIONS_BY_ROLE[r]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setError(null);
    if (getAdminRole() !== "master") {
      setError("최고 관리자만 관리자 정보를 수정할 수 있습니다.");
      return;
    }
    if (!displayName.trim()) {
      setError("표시 이름을 입력하세요.");
      return;
    }
    if (displayName.trim().length > 64) {
      setError("표시 이름은 64자 이내로 입력하세요.");
      return;
    }

    setSubmitting(true);
    const result = updateAdminStaff(staff.id, {
      displayName: displayName.trim(),
      role,
      permissions,
    });
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  };

  if (!staff) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="rounded-xl bg-white p-6 shadow-xl">
          <p className="text-gray-600">해당 관리자를 찾을 수 없습니다.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded border border-gray-300 px-4 py-2 text-[14px] text-gray-700"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">관리자 수정</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            {staff.loginId} — 항목별로 클릭해 권한 부여 여부를 변경하세요.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">로그인 ID</label>
              <input
                type="text"
                value={staff.loginId}
                readOnly
                className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[14px] text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">표시 이름</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder="관리자 목록에 표시될 이름 (64자 이내)"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700">역할</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full max-w-xs rounded border border-gray-300 px-3 py-2 text-[14px]"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <AdminPermissionToggles
              permissions={permissions}
              onToggle={togglePermission}
              onApplyRoleDefaults={handleApplyRoleDefaults}
              canGrantCreateAdmin={true}
              showRoleDefaultsButton={true}
              currentRole={role}
            />
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-signature px-4 py-2 text-[14px] text-white hover:bg-signature/90 disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

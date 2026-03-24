"use client";

import { useState, useCallback } from "react";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey, CreateAdminInput } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { createAdminStaff } from "@/lib/admin-users/mock-admin-staff";
import { getAdminRole } from "@/lib/admin-permission";
import { AdminPermissionToggles } from "./AdminPermissionToggles";

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "operator", label: "운영자" },
  { value: "manager", label: "총괄" },
  { value: "master", label: "최고 관리자" },
];

interface CreateAdminFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAdminForm({ onClose, onSuccess }: CreateAdminFormProps) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminRole>("operator");
  const [permissions, setPermissions] = useState<AdminPermissionKey[]>(
    () => DEFAULT_PERMISSIONS_BY_ROLE.operator
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setError(null);
    if (getAdminRole() !== "master") {
      setError("최고 관리자만 관리자를 생성할 수 있습니다.");
      return;
    }
    if (!loginId.trim()) {
      setError("로그인 ID를 입력하세요.");
      return;
    }
    if (loginId.trim().length < 2 || loginId.trim().length > 64) {
      setError("로그인 ID는 2~64자로 입력하세요.");
      return;
    }
    if (!password || password.length < 4) {
      setError("비밀번호는 4자 이상 입력하세요.");
      return;
    }
    if (displayName.trim().length > 64) {
      setError("표시 이름은 64자 이내로 입력하세요.");
      return;
    }

    setSubmitting(true);
    const input: CreateAdminInput = {
      loginId: loginId.trim(),
      password,
      displayName: displayName.trim() || loginId.trim(),
      role,
      permissions,
    };
    const result = createAdminStaff(input);
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">관리자 수동 생성</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            각 항목을 클릭해 권한 부여 여부를 선택하세요. (예: 글쓰기 권한 부여 O/X)
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">로그인 ID</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                maxLength={64}
                autoComplete="username"
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder="이메일 또는 아이디 (2~64자)"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                maxLength={128}
                autoComplete="new-password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder="4자 이상"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">역할</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRole)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
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
              {submitting ? "생성 중…" : "생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

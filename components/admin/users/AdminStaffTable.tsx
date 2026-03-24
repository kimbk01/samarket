"use client";

import type { AdminStaff } from "@/lib/types/admin-staff";
import { getRoleLabel } from "@/lib/admin-users/mock-admin-staff";
import { getPermissionLabel } from "@/lib/admin-users/admin-permissions";

interface AdminStaffTableProps {
  staffList: AdminStaff[];
  /** 최고관리자일 때만 수정 버튼 노출 */
  isMaster?: boolean;
  onEdit?: (staffId: string) => void;
}

export function AdminStaffTable({ staffList, isMaster, onEdit }: AdminStaffTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">로그인 ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">이름</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">역할</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">권한</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">생성일</th>
            {isMaster && onEdit && (
              <th className="w-[72px] px-3 py-2.5 text-right font-medium text-gray-700">관리</th>
            )}
          </tr>
        </thead>
        <tbody>
          {staffList.map((s) => (
            <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium text-gray-800">{s.loginId}</td>
              <td className="px-3 py-2.5 text-gray-700">{s.displayName}</td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[13px] text-gray-700">
                  {getRoleLabel(s.role)}
                </span>
              </td>
              <td className="max-w-[280px] px-3 py-2.5 text-[13px] text-gray-600">
                <span className="line-clamp-2">
                  {s.permissions.length === 0
                    ? "-"
                    : `${s.permissions.slice(0, 5).map(getPermissionLabel).join(", ")}${s.permissions.length > 5 ? ` 외 ${s.permissions.length - 5}개` : ""}`}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(s.createdAt).toLocaleDateString("ko-KR")}
              </td>
              {isMaster && onEdit && (
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(s.id)}
                    className="rounded border border-gray-300 px-2 py-1 text-[13px] text-gray-700 hover:bg-gray-100"
                  >
                    수정
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { AdminUser } from "@/lib/types/admin-user";
import { AdminModerationStatusBadge } from "@/components/admin/AdminModerationStatusBadge";

const MEMBER_TYPE_LABELS: Record<AdminUser["memberType"], string> = {
  normal: "일반",
  premium: "특별",
  admin: "관리자",
};

interface AdminUserTableProps {
  users: AdminUser[];
}

export function AdminUserTable({ users }: AdminUserTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[880px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">로그인 아이디</th>
            <th className="min-w-[200px] px-3 py-2.5 text-left font-medium text-gray-700">회원 UUID</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">닉네임</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">구분</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">지역</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">상품/판매</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">신고</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">가입일</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5">
                <span className="font-mono text-[13px] font-semibold text-gray-900">
                  {u.loginUsername ?? "—"}
                </span>
                {u.loginUsername ? (
                  <button
                    type="button"
                    className="ml-2 align-baseline text-[12px] font-medium text-signature hover:underline"
                    onClick={() => {
                      void navigator.clipboard.writeText(u.loginUsername!).catch(() => {});
                    }}
                  >
                    복사
                  </button>
                ) : null}
              </td>
              <td className="max-w-[240px] px-3 py-2.5 align-top">
                <p className="break-all font-mono text-[11px] leading-snug text-gray-700">{u.id}</p>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="text-[12px] font-medium text-signature hover:underline"
                  >
                    상세
                  </Link>
                  <button
                    type="button"
                    className="text-[12px] font-medium text-signature hover:underline"
                    onClick={() => {
                      void navigator.clipboard.writeText(u.id).catch(() => {});
                    }}
                  >
                    UUID 복사
                  </button>
                </div>
              </td>
              <td className="px-3 py-2.5 text-gray-800">{u.nickname}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {MEMBER_TYPE_LABELS[u.memberType]}
              </td>
              <td className="px-3 py-2.5">
                <AdminModerationStatusBadge status={u.moderationStatus} />
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">
                {u.location ?? "-"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-600">
                {u.productCount} / {u.soldCount}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-600">
                {u.reportCount}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(u.joinedAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

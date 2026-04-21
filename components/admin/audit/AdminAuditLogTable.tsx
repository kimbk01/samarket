"use client";

import Link from "next/link";
import type { AdminAuditLog, AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";

const CATEGORY_LABELS: Record<AuditLogCategory, string> = {
  product: "상품",
  user: "회원",
  chat: "채팅",
  report: "신고",
  review: "리뷰",
  setting: "설정",
  auth: "인증",
};

const RESULT_CLASS: Record<AuditLogResult, string> = {
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-50 text-red-700",
};

interface AdminAuditLogTableProps {
  logs: AdminAuditLog[];
}

export function AdminAuditLogTable({ logs }: AdminAuditLogTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">액션</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">결과</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">관리자</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">대상</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">요약</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">일시</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/audit-logs/${l.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {l.id}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {CATEGORY_LABELS[l.category]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{l.actionType}</td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${RESULT_CLASS[l.result]}`}
                >
                  {l.result === "success"
                    ? "성공"
                    : l.result === "warning"
                      ? "경고"
                      : "오류"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{l.adminNickname}</td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-sam-muted">
                {l.targetLabel ?? l.targetId ?? "-"}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-sam-muted">
                {l.summary}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

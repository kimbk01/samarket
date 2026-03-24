"use client";

import Link from "next/link";
import type { Report } from "@/lib/types/report";

const TARGET_LABEL: Record<Report["targetType"], string> = {
  product: "상품·게시글",
  chat: "채팅",
  user: "사용자",
  community: "동네생활",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  reviewing: "검토중",
  reviewed: "검토완료",
  resolved: "처리완료",
  rejected: "반려",
  sanctioned: "제재완료",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  reviewing: "bg-amber-100 text-amber-800",
  reviewed: "bg-gray-100 text-gray-700",
  resolved: "bg-gray-100 text-gray-700",
  rejected: "bg-red-50 text-red-700",
  sanctioned: "bg-red-50 text-red-700",
};

interface AdminReportTableProps {
  reports: Report[];
}

export function AdminReportTable({ reports }: AdminReportTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">신고 id</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">출처</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">신고일</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">신고자</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">대상 타입</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">대상자</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상품명</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">사유</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">처리자</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">상세보기</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="max-w-[90px] truncate px-3 py-2.5 font-mono text-[12px] text-gray-600">
                {r.id.slice(0, 8)}…
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-gray-500">
                {r.reportSource === "community_feed" ? "피드" : "DB"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                {new Date(r.createdAt).toLocaleString("ko-KR")}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-gray-700">
                {r.reporterNickname ?? r.reporterId}
              </td>
              <td className="px-3 py-2.5 text-gray-700">{TARGET_LABEL[r.targetType]}</td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-gray-700">
                {r.targetTitle ?? r.targetId}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">
                {r.productTitle ?? "-"}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-gray-700">{r.reasonLabel}</td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[r.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {r.resolvedBy ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Link
                  href={`/admin/reports/${r.id}`}
                  className="text-[13px] font-medium text-signature hover:underline"
                >
                  상세보기
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

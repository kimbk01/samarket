"use client";

import Link from "next/link";
import type { AdminAuditLog, AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";
import { getAuditLogById } from "@/lib/admin-audit/mock-admin-audit-logs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminAuditJsonViewer } from "./AdminAuditJsonViewer";

const CATEGORY_LABELS: Record<AuditLogCategory, string> = {
  product: "상품",
  user: "회원",
  chat: "채팅",
  report: "신고",
  review: "리뷰",
  setting: "설정",
  auth: "관리자 인증",
};

const RESULT_LABELS: Record<AuditLogResult, string> = {
  success: "성공",
  warning: "경고",
  error: "오류",
};

function getRelatedHref(log: AdminAuditLog): string | null {
  switch (log.category) {
    case "product":
      return log.targetId ? `/admin/products/${log.targetId}` : null;
    case "user":
      return log.targetId ? `/admin/users/${log.targetId}` : null;
    case "chat":
      return log.targetId ? `/admin/chats/${log.targetId}` : null;
    case "report":
      return log.targetId ? `/admin/reports/${log.targetId}` : null;
    case "review":
      return log.targetId ? `/admin/reviews/${log.targetId}` : null;
    case "setting":
      return "/admin/settings";
    default:
      return null;
  }
}

interface AdminAuditDetailPageProps {
  logId: string;
}

export function AdminAuditDetailPage({ logId }: AdminAuditDetailPageProps) {
  const log = getAuditLogById(logId);

  if (!log) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        로그를 찾을 수 없습니다.
      </div>
    );
  }

  const relatedHref = getRelatedHref(log);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="로그 상세" backHref="/admin/audit-logs" />

      <AdminCard title="기본 정보">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-gray-500">ID</dt>
            <dd className="font-medium text-gray-900">{log.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">유형</dt>
            <dd>{CATEGORY_LABELS[log.category]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">액션</dt>
            <dd>{log.actionType}</dd>
          </div>
          <div>
            <dt className="text-gray-500">결과</dt>
            <dd>{RESULT_LABELS[log.result]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">관리자</dt>
            <dd>
              {log.adminNickname} ({log.adminId})
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">대상</dt>
            <dd>
              {log.targetLabel ?? log.targetId ?? "-"}
              {log.targetId && (
                <span className="ml-2 text-gray-500">({log.targetType})</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">요약</dt>
            <dd className="text-gray-700">{log.summary}</dd>
          </div>
          <div>
            <dt className="text-gray-500">일시</dt>
            <dd>{new Date(log.createdAt).toLocaleString("ko-KR")}</dd>
          </div>
          {log.note && (
            <div>
              <dt className="text-gray-500">메모</dt>
              <dd className="text-gray-700">{log.note}</dd>
            </div>
          )}
        </dl>
      </AdminCard>

      {(log.beforeData !== undefined || log.afterData !== undefined) && (
        <AdminCard title="변경 데이터">
          <div className="space-y-3">
            <AdminAuditJsonViewer label="변경 전" data={log.beforeData} />
            <AdminAuditJsonViewer label="변경 후" data={log.afterData} />
          </div>
        </AdminCard>
      )}

      {relatedHref && (
        <AdminCard title="관련 화면">
          <Link
            href={relatedHref}
            className="text-[14px] font-medium text-signature hover:underline"
          >
            해당 관리 화면으로 이동 (placeholder)
          </Link>
        </AdminCard>
      )}
    </div>
  );
}

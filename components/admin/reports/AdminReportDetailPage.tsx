"use client";

import { useCallback, useState, useEffect } from "react";
import type { Report } from "@/lib/types/report";
import { getReportByIdFromDb } from "@/lib/admin-reports/getReportsFromDb";
import {
  getReportActionsFromDb,
  labelReportActionType,
} from "@/lib/admin-reports/getReportActionsFromDb";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import Link from "next/link";
import { AdminSanctionPanel } from "./AdminSanctionPanel";
import { MODERATION_ACTION_LABELS } from "@/lib/admin-reports/report-admin-utils";

const STATUS_DISPLAY: Record<string, string> = {
  pending: "대기",
  reviewing: "검토중",
  reviewed: "검토완료",
  resolved: "처리완료",
  rejected: "반려",
  sanctioned: "제재완료",
};

interface AdminReportDetailPageProps {
  reportId: string;
}

export function AdminReportDetailPage({ reportId }: AdminReportDetailPageProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLogs, setActionLogs] = useState<
    Awaited<ReturnType<typeof getReportActionsFromDb>>
  >([]);

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [data, logs] = await Promise.all([
        getReportByIdFromDb(reportId),
        getReportActionsFromDb(reportId),
      ]);
      setReport(data ?? null);
      setActionLogs(logs);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  if (loading && !report) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (!report) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        신고를 찾을 수 없습니다.
      </div>
    );
  }


  return (
    <div className="space-y-4">
      <AdminPageHeader title="신고 상세" backHref="/admin/reports" />

      <AdminCard title="신고 정보">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd className="font-medium text-sam-fg">{report.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">유형</dt>
            <dd>
              {report.targetType === "product"
                ? "상품·게시글"
                : report.targetType === "chat"
                  ? "채팅"
                  : report.targetType === "community"
                    ? "커뮤니티 피드"
                    : "사용자"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">대상</dt>
            <dd className="truncate">{report.targetTitle ?? report.targetId}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">사유</dt>
            <dd>
              {report.reasonLabel}
              {report.detail ? (
                <span className="mt-1 block whitespace-pre-wrap sam-text-body-secondary text-sam-muted">{report.detail}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">상태</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                  report.status === "pending" || report.status === "reviewing"
                    ? "bg-amber-100 text-amber-800"
                    : report.status === "rejected" || report.status === "sanctioned"
                      ? "bg-red-50 text-red-700"
                      : "bg-sam-surface-muted text-sam-fg"
                }`}
              >
                {STATUS_DISPLAY[report.status] ?? report.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">신고일</dt>
            <dd>
              {new Date(report.createdAt).toLocaleString("ko-KR")}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="신고자 / 대상자">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">신고자</dt>
            <dd>
              {report.reporterNickname ?? report.reporterId} ({report.reporterId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">피신고자(게시글 작성자) ID</dt>
            <dd className="font-mono sam-text-body-secondary">{report.targetUserId || "—"}</dd>
          </div>
          {report.targetType === "product" && report.targetId && (
            <div>
              <dt className="text-sam-muted">게시글</dt>
              <dd className="flex flex-wrap gap-3">
                <Link href={`/post/${report.targetId}`} className="text-signature hover:underline" target="_blank" rel="noreferrer">
                  웹에서 글 보기
                </Link>
                <Link href="/admin/community/posts" className="sam-text-body-secondary text-sam-muted hover:underline">
                  게시글 관리 목록
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </AdminCard>

      <AdminCard title="처리 · 제재 (DB 연동)">
        <p className="mb-3 sam-text-body-secondary text-sam-muted">
          반려·경고·채팅 제한·<strong>게시글 숨김</strong>(posts.status → hidden)·계정 정지 등은{" "}
          <code className="sam-text-xxs">report_actions</code>에 기록되고, 해당 시{" "}
          <code className="sam-text-xxs">sanctions</code>에 제재가 쌓입니다.
        </p>
        <AdminSanctionPanel
          reportId={report.id}
          targetUserId={report.targetUserId}
          targetLabel={report.targetTitle ?? report.targetId}
          onActionSuccess={refreshDetail}
        />
      </AdminCard>
      <AdminCard title="처리 이력 (report_actions)">
        {actionLogs.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">처리 이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {actionLogs.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary"
              >
                <span className="font-medium text-sam-fg">
                  {MODERATION_ACTION_LABELS[a.actionType] ?? labelReportActionType(a.actionType)}
                </span>
                <span className="text-sam-muted">{new Date(a.createdAt).toLocaleString("ko-KR")}</span>
                <span className="text-sam-muted">· {a.adminNickname}</span>
                {a.actionNote ? (
                  <span className="w-full text-sam-muted">메모: {a.actionNote}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
      {report.targetType === "chat" && report.targetId && (
        <AdminCard title="관련 채팅">
          <Link
            href={`/admin/chats/${report.targetId}`}
            className="sam-text-body font-medium text-signature hover:underline"
          >
            채팅방 상세 보기
          </Link>
        </AdminCard>
      )}
    </div>
  );
}

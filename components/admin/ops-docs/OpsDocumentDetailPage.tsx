"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";
import { setOpsDocumentStatusWithLog, duplicateOpsDocument } from "@/lib/ops-docs/ops-docs-utils";
import { OpsDocumentStepList } from "./OpsDocumentStepList";
import { OpsDocumentLogList } from "./OpsDocumentLogList";

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  active: "활성",
  archived: "보관",
};

const CATEGORY_LABELS: Record<string, string> = {
  incident_response: "인시던트 대응",
  deployment: "배포",
  rollback: "롤백",
  moderation: "검수",
  recommendation: "추천",
  ads: "광고",
  points: "포인트",
  support: "지원",
};

type TabId = "detail" | "steps" | "logs";

export function OpsDocumentDetailPage({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("detail");
  const [refresh, setRefresh] = useState(0);

  const doc = useMemo(
    () => getOpsDocumentById(documentId),
    [documentId, refresh]
  );

  if (!doc) {
    return (
      <>
        <AdminPageHeader title="문서 없음" backHref="/admin/ops-docs" />
        <p className="text-[14px] text-gray-500">해당 문서를 찾을 수 없습니다.</p>
      </>
    );
  }

  const handleStatusChange = (status: "active" | "archived") => {
    setOpsDocumentStatusWithLog(documentId, status, "admin1", "관리자");
    setRefresh((r) => r + 1);
  };

  const handleDuplicate = () => {
    const result = duplicateOpsDocument(documentId, `${doc.title} (복사본)`, "admin1", "관리자");
    if (result) router.push(`/admin/ops-docs/${result.id}`);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "detail", label: "문서 상세" },
    { id: "steps", label: "실행 단계" },
    { id: "logs", label: "변경 이력" },
  ];

  return (
    <>
      <AdminPageHeader title={doc.title} backHref="/admin/ops-docs" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/ops-docs/${documentId}/edit`}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
        >
          수정
        </Link>
        <button
          type="button"
          onClick={handleDuplicate}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
        >
          복제
        </button>
        {doc.status === "active" && (
          <button
            type="button"
            onClick={() => handleStatusChange("archived")}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
          >
            보관
          </button>
        )}
        {(doc.status === "draft" || doc.status === "archived") && (
          <button
            type="button"
            onClick={() => handleStatusChange("active")}
            className="rounded border border-signature bg-signature px-3 py-2 text-[14px] font-medium text-white"
          >
            활성화
          </button>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "detail" && (
        <AdminCard>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                {DOC_TYPE_LABELS[doc.docType]}
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                {CATEGORY_LABELS[doc.category]}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  doc.status === "active"
                    ? "bg-emerald-50 text-emerald-800"
                    : doc.status === "draft"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {STATUS_LABELS[doc.status]}
              </span>
              {doc.versionLabel && (
                <span className="text-gray-500">v{doc.versionLabel}</span>
              )}
            </div>
            <p className="text-[14px] text-gray-700">{doc.summary}</p>
            <div className="rounded border border-gray-100 bg-gray-50 p-4 font-mono text-[13px] text-gray-800 whitespace-pre-wrap">
              {doc.content}
            </div>
            {doc.tags.length > 0 && (
              <p className="text-[13px] text-gray-500">
                태그: {doc.tags.join(", ")}
              </p>
            )}
            <div className="border-t border-gray-100 pt-3 text-[13px] text-gray-500">
              작성: {doc.createdByAdminNickname} · 최근 수정{" "}
              {new Date(doc.updatedAt).toLocaleString("ko-KR")}
              {doc.approvedByAdminNickname && (
                <> · 승인 {doc.approvedByAdminNickname}</>
              )}
            </div>
          </div>
        </AdminCard>
      )}
      {activeTab === "steps" && (
        <AdminCard title="실행 단계">
          <OpsDocumentStepList documentId={documentId} />
        </AdminCard>
      )}
      {activeTab === "logs" && (
        <AdminCard title="변경 이력">
          <OpsDocumentLogList documentId={documentId} />
        </AdminCard>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import type { OpsKnowledgeBaseIndexItem } from "@/lib/types/ops-knowledge";

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

const CATEGORY_LABELS: Record<string, string> = {
  incident_response: "인시던트",
  deployment: "배포",
  rollback: "롤백",
  moderation: "검수",
  recommendation: "추천",
  ads: "광고",
  points: "포인트",
  support: "지원",
};

interface OpsKnowledgePreviewCardProps {
  item: OpsKnowledgeBaseIndexItem;
  onView?: (documentId: string) => void;
}

export function OpsKnowledgePreviewCard({ item, onView }: OpsKnowledgePreviewCardProps) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-sam-muted">
        <span>{DOC_TYPE_LABELS[item.docType]}</span>
        <span>{CATEGORY_LABELS[item.category]}</span>
        {item.isPinned && <span>📌 고정</span>}
      </div>
      <h3 className="mt-2 font-medium text-sam-fg">
        <Link
          href={`/admin/ops-docs/${item.documentId}`}
          className="text-signature hover:underline"
          onClick={() => onView?.(item.documentId)}
        >
          {item.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-3 text-[13px] text-sam-muted">{item.summary}</p>
      {item.tags.length > 0 && (
        <p className="mt-2 text-[12px] text-sam-muted">
          {item.tags.join(", ")}
        </p>
      )}
      <p className="mt-2 text-[12px] text-sam-meta">
        수정 {new Date(item.updatedAt).toLocaleDateString("ko-KR")}
      </p>
    </div>
  );
}

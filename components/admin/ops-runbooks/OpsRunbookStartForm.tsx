"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsRunbookLinkedType } from "@/lib/types/ops-runbook";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";
import { startRunbookExecution } from "@/lib/ops-runbooks/ops-runbook-utils";

const LINKED_OPTIONS: { value: OpsRunbookLinkedType; label: string }[] = [
  { value: "incident", label: "이슈/인시던트" },
  { value: "deployment", label: "배포" },
  { value: "rollback", label: "롤백" },
  { value: "fallback", label: "Fallback" },
  { value: "kill_switch", label: "킬스위치" },
  { value: "manual", label: "수동" },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

export function OpsRunbookStartForm() {
  const router = useRouter();
  const [documentId, setDocumentId] = useState("");
  const [linkedType, setLinkedType] = useState<OpsRunbookLinkedType>("incident");
  const [linkedId, setLinkedId] = useState("");

  const activeDocs = useMemo(
    () => getOpsDocuments({ status: "active", sort: "updated" }),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId.trim()) return;
    const result = startRunbookExecution(
      documentId,
      linkedType,
      linkedId.trim() || null,
      "admin1",
      "관리자"
    );
    if (result) router.push(`/admin/ops-runbooks/${result.executionId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-[14px] font-medium text-gray-900">런북 실행 시작</h3>
      <p className="text-[13px] text-gray-600">
        활성(active) 문서만 선택 가능합니다. 연결 타입과 ID로 35단계 이슈·33단계 배포·34단계 Fallback/킬스위치와 연결할 수 있습니다.
      </p>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-gray-700">문서 선택</label>
        <select
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          required
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">선택</option>
          {activeDocs.map((d) => (
            <option key={d.id} value={d.id}>
              [{DOC_TYPE_LABELS[d.docType]}] {d.title}
            </option>
          ))}
        </select>
        {activeDocs.length === 0 && (
          <p className="mt-1 text-[12px] text-amber-600">활성 문서가 없습니다. 운영 문서에서 활성화해 주세요.</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-gray-700">연결 유형</label>
        <select
          value={linkedType}
          onChange={(e) => setLinkedType(e.target.value as OpsRunbookLinkedType)}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {LINKED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-gray-700">연결 ID (선택)</label>
        <input
          type="text"
          value={linkedId}
          onChange={(e) => setLinkedId(e.target.value)}
          placeholder="예: inc-1, rd-1"
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <button
        type="submit"
        disabled={!documentId.trim() || activeDocs.length === 0}
        className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
      >
        실행 시작
      </button>
    </form>
  );
}

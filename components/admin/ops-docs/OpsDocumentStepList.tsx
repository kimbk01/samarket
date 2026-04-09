"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getOpsDocumentSteps } from "@/lib/ops-docs/mock-ops-document-steps";
import type { OpsDocumentStepLinkedType } from "@/lib/types/ops-docs";

const LINKED_TYPE_LABELS: Record<OpsDocumentStepLinkedType, string> = {
  incident: "이슈/인시던트",
  deployment: "배포",
  report: "보고서",
  checklist: "체크리스트",
  action_item: "액션아이템",
};

const LINKED_HREF: Record<OpsDocumentStepLinkedType, (id: string) => string> = {
  incident: (id) => `/admin/recommendation-monitoring?incident=${id}`,
  deployment: (id) => `/admin/recommendation-deployments`,
  report: (id) => `/admin/recommendation-reports/${id}`,
  checklist: () => `/admin/ops-board`,
  action_item: () => `/admin/ops-board`,
};

interface OpsDocumentStepListProps {
  documentId: string;
}

export function OpsDocumentStepList({ documentId }: OpsDocumentStepListProps) {
  const steps = useMemo(
    () => getOpsDocumentSteps(documentId),
    [documentId]
  );

  if (steps.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        등록된 단계가 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {steps.map((s, idx) => (
        <li
          key={s.id}
          className="flex gap-3 rounded-ui-rect border border-gray-200 bg-white p-4"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[14px] font-medium text-gray-700">
            {s.stepOrder}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{s.title}</span>
              {s.isRequired && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                  필수
                </span>
              )}
              {s.estimatedMinutes != null && (
                <span className="text-[12px] text-gray-500">
                  약 {s.estimatedMinutes}분
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] text-gray-600">{s.description}</p>
            {s.linkedType && (
              <p className="mt-2 text-[12px] text-gray-500">
                연결: {LINKED_TYPE_LABELS[s.linkedType]}
                {s.linkedId && (
                  <>
                    {" · "}
                    <Link
                      href={LINKED_HREF[s.linkedType](s.linkedId)}
                      className="text-signature hover:underline"
                    >
                      {s.linkedId}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

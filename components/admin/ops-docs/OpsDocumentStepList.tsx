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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        등록된 단계가 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {steps.map((s, idx) => (
        <li
          key={s.id}
          className="flex gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted sam-text-body font-medium text-sam-fg">
            {s.stepOrder}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sam-fg">{s.title}</span>
              {s.isRequired && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 sam-text-xxs text-amber-800">
                  필수
                </span>
              )}
              {s.estimatedMinutes != null && (
                <span className="sam-text-helper text-sam-muted">
                  약 {s.estimatedMinutes}분
                </span>
              )}
            </div>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{s.description}</p>
            {s.linkedType && (
              <p className="mt-2 sam-text-helper text-sam-muted">
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

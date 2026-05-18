"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getBlockedOrFailedTestCases } from "@/lib/qa-board/mock-qa-test-cases";
import { getQaTestSuiteById } from "@/lib/qa-board/mock-qa-test-suites";
import { getDomainLabel, getCaseStatusLabel } from "@/lib/qa-board/qa-board-utils";
import Link from "next/link";

export function QaBlockerBoard() {
  const { t } = useI18n();
  const blockedOrFailed = useMemo(() => getBlockedOrFailedTestCases(), []);

  if (blockedOrFailed.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
        {t("admin_qa_empty_failed_blocked")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_qa_failed_blocked")}</p>
      <div className="space-y-3">
        {blockedOrFailed.map((c) => {
          const suite = getQaTestSuiteById(c.suiteId);
          const isMustPass = c.isMustPass;
          return (
            <div
              key={c.id}
              className={`rounded-ui-rect border p-4 ${
                c.status === "failed"
                  ? "border-red-200 bg-red-50/50"
                  : "border-amber-200 bg-amber-50/50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
                {suite && <span>{getDomainLabel(t, suite.domain)}</span>}
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
                  {getCaseStatusLabel(t, c.status)}
                </span>
                {isMustPass && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                    {t("admin_qa_must_pass")}
                  </span>
                )}
              </div>
              <p className="mt-2 font-medium text-sam-fg">{c.title}</p>
              <p className="mt-2 sam-text-body text-red-800">
                {c.blockerReason || c.failureNote || "—"}
              </p>
              <p className="mt-2 sam-text-body-secondary text-sam-muted">
                {t("admin_qa_owner_label")} {c.ownerAdminNickname ?? "-"}
                {c.executedAt &&
                  ` · ${t("admin_qa_k74a23ff7")} ${new Date(c.executedAt).toLocaleString()}`}
              </p>
              {c.linkedType && (
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {t("admin_qa_link_2")}: {c.linkedType}{" "}
                  {c.linkedId && (
                    <Link href={`/admin/${c.linkedType}/${c.linkedId}`} className="text-signature">
                      {c.linkedId}
                    </Link>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

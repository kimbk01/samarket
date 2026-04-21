"use client";

import { useMemo } from "react";
import { getBlockedMigrationTables } from "@/lib/production-migration/mock-production-migration-tables";
import { getBlockedLaunchChecks } from "@/lib/production-migration/mock-production-launch-checks";
import { getProductionInfraChecks } from "@/lib/production-migration/mock-production-infra-checks";
import {
  getDomainLabel,
  getTableStatusLabel,
  getInfraCategoryLabel,
} from "@/lib/production-migration/production-migration-utils";
import Link from "next/link";

export function ProductionBlockerBoard() {
  const blockedTables = useMemo(() => getBlockedMigrationTables(), []);
  const blockedLaunch = useMemo(() => getBlockedLaunchChecks(), []);
  const infraWithBlocker = useMemo(
    () => getProductionInfraChecks().filter((c) => c.blockerReason),
    []
  );

  const hasAny =
    blockedTables.length > 0 ||
    blockedLaunch.length > 0 ||
    infraWithBlocker.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
        차단(blocker) 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {blockedTables.length > 0 && (
        <div>
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            테이블 차단
          </h3>
          <div className="space-y-3">
            {blockedTables.map((t) => (
              <div
                key={t.id}
                className="rounded-ui-rect border border-red-200 bg-red-50/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
                  <span>{getDomainLabel(t.domain)}</span>
                  <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
                    {getTableStatusLabel(t.status)}
                  </span>
                </div>
                <p className="mt-1 font-medium text-sam-fg">{t.tableName}</p>
                <p className="mt-2 sam-text-body text-red-800">
                  {t.blockerReason}
                </p>
                {t.note && (
                  <p className="mt-1 sam-text-body-secondary text-sam-muted">{t.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {blockedLaunch.length > 0 && (
        <div>
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            배포 체크리스트 차단
          </h3>
          <div className="space-y-3">
            {blockedLaunch.map((c) => (
              <div
                key={c.id}
                className="rounded-ui-rect border border-red-200 bg-red-50/50 p-4"
              >
                <p className="font-medium text-sam-fg">{c.title}</p>
                <p className="mt-2 sam-text-body text-red-800">
                  {c.blockerReason}
                </p>
                {c.linkedType === "action_item" && c.linkedId && (
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    <Link
                      href="/admin/ops-board"
                      className="text-signature hover:underline"
                    >
                      액션아이템 {c.linkedId}
                    </Link>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {infraWithBlocker.length > 0 && (
        <div>
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            인프라 차단
          </h3>
          <div className="space-y-3">
            {infraWithBlocker.map((c) => (
              <div
                key={c.id}
                className="rounded-ui-rect border border-red-200 bg-red-50/50 p-4"
              >
                <p className="font-medium text-sam-fg">{c.targetName}</p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">
                  {getInfraCategoryLabel(c.category)}
                </p>
                <p className="mt-2 sam-text-body text-red-800">
                  {c.blockerReason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

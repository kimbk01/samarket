"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import {
  getBlockedReadinessItems,
  getLaunchBlockerLogs,
} from "@/lib/launch-readiness/launch-readiness-state";
import { getAreaLabel, getGateLabel } from "@/lib/launch-readiness/launch-readiness-utils";
import Link from "next/link";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function LaunchBlockerBoard() {
  const { t, language } = useI18n();
  const blocked = useMemo(() => getBlockedReadinessItems(), []);
  const logsByItem = useMemo(() => {
    const map: Record<string, ReturnType<typeof getLaunchBlockerLogs>> = {};
    blocked.forEach((i) => {
      map[i.id] = getLaunchBlockerLogs({ readinessItemId: i.id });
    });
    return map;
  }, [blocked]);

  if (blocked.length === 0) {
    return (
      <AdminEmptyState ko={language !== "en"} message={t("admin_launch_ready_no_blockers")} />
    );
  }

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_launch_ready_blocker_only_note")}
      </p>
      <div className="space-y-4">
        {blocked.map((item) => (
          <div
            key={item.id}
            className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft p-4"
          >
            <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
              <span>{getAreaLabel(item.area)}</span>
              <span className="rounded bg-sam-danger-soft px-1.5 py-0.5 text-sam-danger">
                {getGateLabel(item.gateType)}
              </span>
            </div>
            <h3 className="mt-2 font-medium text-sam-fg">{item.title}</h3>
            <p className="mt-2 sam-text-body text-sam-danger">
              {item.blockerReason}
            </p>
            {(item.ownerAdminNickname || item.dueDate) && (
              <p className="mt-2 sam-text-helper text-sam-muted">
                {t("admin_launch_ready_owner", { name: item.ownerAdminNickname ?? "-" })}
                {item.dueDate && t("admin_launch_ready_due_suffix", { date: item.dueDate })}
              </p>
            )}
            {item.linkedType && item.linkedId && (
              <p className="mt-1 sam-text-helper text-sam-muted">
                {t("admin_launch_ready_linked", { type: item.linkedType })}{" "}
                {item.linkedType === "action_item" && (
                  <Link
                    href="/admin/ops-board"
                    className="text-signature hover:underline"
                  >
                    {item.linkedId}
                  </Link>
                )}
                {item.linkedType !== "action_item" && item.linkedId}
              </p>
            )}
            {logsByItem[item.id]?.length > 0 && (
              <div className="mt-3 border-t border-sam-danger pt-3">
                <p className="sam-text-helper font-medium text-sam-muted">
                  {t("admin_launch_ready_blocker_log")}
                </p>
                <ul className="mt-1 space-y-1 sam-text-helper text-sam-muted">
                  {logsByItem[item.id].map((log) => (
                    <li key={log.id}>
                      {log.actionType} · {log.actorNickname} · {log.note} ·{" "}
                      {formatAdminManilaDateTime(log.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

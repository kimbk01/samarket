"use client";

import { useMemo } from "react";
import { getBlockedReadinessItems } from "@/lib/launch-readiness/mock-launch-readiness-items";
import { getLaunchBlockerLogs } from "@/lib/launch-readiness/mock-launch-blocker-logs";
import { getAreaLabel, getGateLabel } from "@/lib/launch-readiness/launch-readiness-utils";
import Link from "next/link";

export function LaunchBlockerBoard() {
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
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
        차단(blocker) 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        blockerReason이 있는 항목만 노출됩니다.
      </p>
      <div className="space-y-4">
        {blocked.map((item) => (
          <div
            key={item.id}
            className="rounded-ui-rect border border-red-200 bg-red-50/50 p-4"
          >
            <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
              <span>{getAreaLabel(item.area)}</span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                {getGateLabel(item.gateType)}
              </span>
            </div>
            <h3 className="mt-2 font-medium text-sam-fg">{item.title}</h3>
            <p className="mt-2 sam-text-body text-red-800">
              {item.blockerReason}
            </p>
            {(item.ownerAdminNickname || item.dueDate) && (
              <p className="mt-2 sam-text-helper text-sam-muted">
                담당 {item.ownerAdminNickname ?? "-"}
                {item.dueDate && ` · 기한 ${item.dueDate}`}
              </p>
            )}
            {item.linkedType && item.linkedId && (
              <p className="mt-1 sam-text-helper text-sam-muted">
                연결: {item.linkedType} ·{" "}
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
              <div className="mt-3 border-t border-red-200 pt-3">
                <p className="sam-text-helper font-medium text-sam-muted">
                  Blocker 로그
                </p>
                <ul className="mt-1 space-y-1 sam-text-helper text-sam-muted">
                  {logsByItem[item.id].map((log) => (
                    <li key={log.id}>
                      {log.actionType} · {log.actorNickname} · {log.note} ·{" "}
                      {new Date(log.createdAt).toLocaleString()}
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

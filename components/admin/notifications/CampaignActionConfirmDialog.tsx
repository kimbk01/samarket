"use client";

import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import {
  campaignConfirmCopy,
  campaignConfirmFactLines,
  type CampaignConfirmAction,
  type CampaignConfirmFacts,
} from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";

/**
 * Campaign mutation confirm — every send/schedule/cancel/stop/resend/archive re-shows
 * 대상 수 · 채널 · 시각 before running.
 */
export function CampaignActionConfirmDialog({
  action,
  facts,
  lang,
  pending,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  action: CampaignConfirmAction | null;
  facts: CampaignConfirmFacts | null;
  lang: "ko" | "en";
  pending: boolean;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const open = action != null && facts != null;
  const copy = action ? campaignConfirmCopy(action, lang) : null;
  return (
    <AdminActionConfirmDialog
      open={open}
      title={copy?.title ?? ""}
      description={copy?.description ?? ""}
      confirmLabel={copy?.confirmLabel ?? ""}
      cancelLabel={cancelLabel}
      tone={copy?.tone ?? "primary"}
      pending={pending}
      onCancel={onCancel}
      onConfirm={() => onConfirm()}
    >
      {facts ? (
        <ul
          className="mt-3 space-y-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg"
          data-campaign-confirm-facts="1"
        >
          {campaignConfirmFactLines(facts, lang).map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </AdminActionConfirmDialog>
  );
}

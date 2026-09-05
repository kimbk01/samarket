"use client";

/**
 * ARO-OPS-UX-002-B1R — ONE confirmation for N selected Trade posts, then apply.
 * Cancel → abort entire bulk (no per-row prompt loop).
 */

import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import {
  updatePostStatusAdmin,
  type AdminUpdateResult,
} from "@/lib/admin-posts/updatePostAdmin";
import type {
  AdminPostModerationAction,
  AdminPostModerationProduct,
} from "@/lib/admin-posts/confirm-admin-post-moderation";

export type BulkModerationLabels = {
  hideTitle: string;
  restoreTitle: string;
  deleteTitle: string;
  softDeleteHint: string;
  reasonPlaceholder: string;
  cancelLabel: string;
  confirmLabel: string;
};

export type BulkModerationItemResult = {
  id: string;
  ok: boolean;
  error?: string;
};

export type BulkModerationOutcome =
  | { cancelled: true }
  | { cancelled: false; results: BulkModerationItemResult[]; successCount: number; failCount: number };

function bulkMeta(
  action: Extract<AdminPostModerationAction, "hide" | "restore" | "delete">,
  products: AdminPostModerationProduct[],
  softDeleteHint: string,
  language: string | undefined
): string {
  const n = products.length;
  const samples = products
    .slice(0, 5)
    .map((p) => `· ${(p.title || p.id).slice(0, 40)}`)
    .join("\n");
  const more =
    products.length > 5
      ? language === "en"
        ? `\n… and ${products.length - 5} more`
        : `\n… 외 ${products.length - 5}건`
      : "";
  const entity =
    language === "en" ? `Trade posts: ${n}` : `거래 게시물: ${n}건`;
  if (action === "delete") {
    return `${entity}\n${softDeleteHint}\n\n${samples}${more}`;
  }
  return `${entity}\n\n${samples}${more}`;
}

/**
 * Single confirm/prompt for the whole selection, then mutate each id without further dialogs.
 */
export async function confirmAndApplyBulkAdminPostStatus(args: {
  action: Extract<AdminPostModerationAction, "hide" | "restore" | "delete">;
  products: AdminPostModerationProduct[];
  labels: BulkModerationLabels;
  language?: string;
}): Promise<BulkModerationOutcome> {
  const { action, products, labels, language } = args;
  if (products.length === 0) return { cancelled: true };

  const meta = bulkMeta(action, products, labels.softDeleteHint, language);
  let reason: string | null = null;

  if (action === "restore") {
    const ok = await dibayConfirm({
      title: `${labels.restoreTitle} (${products.length})`,
      description: meta,
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (!ok) return { cancelled: true };
  } else if (action === "hide") {
    const typed = await dibayPrompt({
      title: `${labels.hideTitle} (${products.length})`,
      description: meta,
      placeholder: labels.reasonPlaceholder,
      required: true,
      confirmTone: "destructive",
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (typed == null) return { cancelled: true };
    reason = typed.trim();
  } else {
    // soft delete — ONE prompt for all selected
    const typed = await dibayPrompt({
      title: `${labels.deleteTitle} (${products.length})`,
      description: meta,
      placeholder: labels.reasonPlaceholder,
      required: true,
      confirmTone: "destructive",
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (typed == null) return { cancelled: true };
    reason = typed.trim();
  }

  const results: BulkModerationItemResult[] = [];
  for (const p of products) {
    const status =
      action === "hide" ? "hidden" : action === "restore" ? "active" : "deleted";
    const res: AdminUpdateResult = await updatePostStatusAdmin(p.id, status, {
      reason,
    });
    if (res.ok) results.push({ id: p.id, ok: true });
    else results.push({ id: p.id, ok: false, error: res.error });
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;
  return { cancelled: false, results, successCount, failCount };
}

export async function alertBulkModerationSummary(args: {
  language?: string;
  successCount: number;
  failCount: number;
  results: BulkModerationItemResult[];
}): Promise<void> {
  const { language, successCount, failCount, results } = args;
  if (failCount === 0) {
    await dibayAlert({
      title:
        language === "en"
          ? `Completed ${successCount}`
          : `${successCount}건 처리 완료`,
    });
    return;
  }
  const failedLines = results
    .filter((r) => !r.ok)
    .slice(0, 8)
    .map((r) => `· ${r.id.slice(0, 8)}… ${r.error ?? "fail"}`)
    .join("\n");
  await dibayAlert({
    title:
      language === "en"
        ? `${successCount} ok · ${failCount} failed`
        : `${successCount}건 완료 · ${failCount}건 실패`,
    description: failedLines,
  });
}

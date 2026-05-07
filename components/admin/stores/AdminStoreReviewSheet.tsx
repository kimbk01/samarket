"use client";

import { useEffect } from "react";
import { AdminStoreReviewPanel, type AdminStoreReviewPanelProps } from "@/components/admin/stores/AdminStoreReviewPanel";

export type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
export {
  ADMIN_STORE_APPROVAL_LABEL,
  formatAdminStoreAddressOneLine,
} from "@/components/admin/stores/admin-store-review-model";

type AdminStoreReviewSheetProps = AdminStoreReviewPanelProps & { onClose: () => void };

/**
 * Legacy overlay wrapper.
 * New admin UI uses `AdminStoreReviewPanel` directly (master-detail).
 */
export function AdminStoreReviewSheet(props: AdminStoreReviewSheetProps) {
  const { store, onClose } = props;

  useEffect(() => {
    if (!store) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, onClose]);

  if (!store) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-3xl rounded-t-ui-rect border border-sam-border bg-sam-surface shadow-xl">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="sam-text-helper font-semibold text-sam-muted">매장 심사</p>
              <p className="truncate sam-text-body-lg font-bold text-sam-fg">
                {(store.store_name ?? "").trim() || "(매장명 없음)"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-ui-rect px-3 py-1.5 sam-text-body-secondary font-medium text-sam-muted hover:bg-sam-surface-muted"
            >
              닫기
            </button>
          </div>
          <div className="mt-2">
            <label className="sam-text-xxs font-bold uppercase tracking-wide text-sam-muted">
              조치
            </label>
            <select
              defaultValue=""
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg"
              onChange={(e) => {
                const action = e.target.value;
                e.target.value = "";
                if (!action) return;
                const needsReason = ["reject_store", "request_revision", "suspend_store", "reject_sales", "suspend_sales"].includes(action);
                const reason = needsReason ? window.prompt("사유", "")?.trim() ?? "" : "";
                if (needsReason && !reason) return;
                props.onRunAction?.(action, reason ? { reason } : undefined);
              }}
              disabled={Boolean(props.actionBusy || props.identityActionBusy)}
            >
              <option value="">선택…</option>
              <optgroup label="매장 심사">
                <option value="approve_store">매장 승인</option>
                <option value="request_revision">보완 요청</option>
                <option value="reject_store">반려</option>
                <option value="suspend_store">매장 정지</option>
                <option value="resume_store">재개(노출 복구)</option>
              </optgroup>
              <optgroup label="판매권한">
                <option value="approve_sales">판매 승인</option>
                <option value="reject_sales">판매 거절</option>
                <option value="suspend_sales">판매 정지</option>
              </optgroup>
            </select>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <AdminStoreReviewPanel {...props} />
        </div>
      </aside>
    </div>
  );
}

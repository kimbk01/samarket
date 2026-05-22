"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminStoreReviewPanel, type AdminStoreReviewPanelProps } from "@/components/admin/stores/AdminStoreReviewPanel";

export type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
export {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  formatAdminStoreAddressOneLine,
} from "@/components/admin/stores/admin-store-review-model";

type AdminStoreReviewSheetProps = AdminStoreReviewPanelProps & { onClose: () => void };

/**
 * Legacy overlay wrapper.
 * New admin UI uses `AdminStoreReviewPanel` directly (master-detail).
 */
export function AdminStoreReviewSheet(props: AdminStoreReviewSheetProps) {
  const { t } = useI18n();
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

  const storeName = (store.store_name ?? "").trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t("common_close")}
        onClick={onClose}
      />
      <aside className="relative w-full max-w-3xl rounded-t-ui-rect border border-sam-border bg-sam-surface shadow-xl">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="sam-text-helper font-semibold text-sam-muted">{t("admin_stores_review_title")}</p>
              <p className="truncate sam-text-body-lg font-bold text-sam-fg">
                {storeName || t("admin_stores_field_store_name_ph")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-ui-rect px-3 py-1.5 sam-text-body-secondary font-medium text-sam-muted hover:bg-sam-surface-muted"
            >
              {t("common_close")}
            </button>
          </div>
          <div className="mt-2">
            <label className="sam-text-xxs font-bold uppercase tracking-wide text-sam-muted">
              {t("admin_stores_review_action")}
            </label>
            <select
              defaultValue=""
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg"
              onChange={(e) => {
                const action = e.target.value;
                e.target.value = "";
                if (!action) return;
                const needsReason = [
                  "reject_store",
                  "request_revision",
                  "suspend_store",
                  "reject_sales",
                  "suspend_sales",
                ].includes(action);
                const reason = needsReason
                  ? window.prompt(t("admin_stores_prompt_reason"), "")?.trim() ?? ""
                  : "";
                if (needsReason && !reason) return;
                if (action === "set_store_visible_on") {
                  props.onRunAction?.("set_store_visible", { enabled: true });
                  return;
                }
                if (action === "set_store_visible_off") {
                  props.onRunAction?.("set_store_visible", { enabled: false });
                  return;
                }
                props.onRunAction?.(action, reason ? { reason } : undefined);
              }}
              disabled={Boolean(props.actionBusy || props.identityActionBusy)}
            >
              <option value="">{t("admin_stores_review_select_placeholder")}</option>
              <optgroup label={t("admin_stores_review_group_store")}>
                <option value="approve_store">{t("admin_stores_action_approve_store")}</option>
                <option value="request_revision">{t("admin_stores_action_request_revision")}</option>
                <option value="reject_store">{t("admin_stores_action_reject_store")}</option>
                <option value="suspend_store">{t("admin_stores_action_suspend_store")}</option>
                <option value="resume_store">{t("admin_stores_action_resume_store")}</option>
              </optgroup>
              <optgroup label={t("admin_stores_review_group_sales")}>
                <option value="approve_sales">{t("admin_stores_action_approve_sales")}</option>
                <option value="reject_sales">{t("admin_stores_action_reject_sales")}</option>
                <option value="suspend_sales">{t("admin_stores_action_suspend_sales")}</option>
              </optgroup>
              {props.store?.approval_status === "approved" ? (
                <optgroup label={t("admin_stores_review_group_visibility")}>
                  <option value="set_store_visible_on">{t("admin_stores_action_visible_on")}</option>
                  <option value="set_store_visible_off">{t("admin_stores_action_visible_off")}</option>
                </optgroup>
              ) : null}
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

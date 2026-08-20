"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useState } from "react";
import type { Product, ProductStatus } from "@/lib/types/product";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { updatePostBumpAdmin } from "@/lib/admin-posts/updatePostAdmin";
import {
  confirmAndUpdateAdminPostStatus,
  type AdminPostModerationAction,
} from "@/lib/admin-posts/confirm-admin-post-moderation";

interface AdminProductActionPanelProps {
  product: Product;
  onActionSuccess: () => void;
}

type ActionType = AdminPostModerationAction | "bump";

const ACTION_LABEL_KEYS: Record<ActionType, MessageKey> = {
  hide: "admin_products_action_hide",
  restore: "admin_products_action_restore",
  delete: "admin_products_action_delete",
  mark_sold: "admin_products_action_mark_sold",
  mark_active: "admin_products_action_mark_active",
  bump: "admin_products_action_bump",
};

/** Blind = separate DB status 없음 — hide와 동일 CTA 노출 금지 (LIGHTWEIGHT). */
function getActions(status: ProductStatus): ActionType[] {
  switch (status) {
    case "active":
      return ["hide", "mark_sold", "bump"];
    case "reserved":
      return ["hide", "mark_sold", "mark_active", "bump"];
    case "sold":
      return ["hide", "mark_active", "bump"];
    case "hidden":
    case "blinded":
      return ["restore", "delete"];
    case "deleted":
      return [];
    default:
      return [];
  }
}

export function AdminProductActionPanel({
  product,
  onActionSuccess,
}: AdminProductActionPanelProps) {
  const { t, safeT } = useI18n();
  const [loading, setLoading] = useState<ActionType | null>(null);
  const actions = getActions(product.status);

  const moderationLabels = {
    hideTitle: safeT("admin_products_confirm_hide", {
      fallbackKo: "이 게시물을 숨기시겠습니까?",
      fallbackEn: "Hide this listing?",
    }),
    restoreTitle: safeT("admin_products_confirm_restore", {
      fallbackKo: "숨김을 해제할까요?",
      fallbackEn: "Restore this listing?",
    }),
    deleteTitle: safeT("admin_products_confirm_soft_delete", {
      fallbackKo: "소프트 삭제할까요? (영구 삭제 아님)",
      fallbackEn: "Soft-delete this listing? (not permanent)",
    }),
    markSoldTitle: safeT("admin_products_confirm_mark_sold", {
      fallbackKo: "판매완료로 표시할까요?",
      fallbackEn: "Mark as sold?",
    }),
    markActiveTitle: safeT("admin_products_confirm_mark_active", {
      fallbackKo: "판매중으로 되돌릴까요?",
      fallbackEn: "Mark as active?",
    }),
    reasonPlaceholder: safeT("admin_products_reason_placeholder", {
      fallbackKo: "사유를 입력하세요",
      fallbackEn: "Enter a reason",
    }),
    softDeleteHint: safeT("admin_products_soft_delete_hint", {
      fallbackKo: "status=deleted 로 표시됩니다. DB 영구 삭제가 아닙니다.",
      fallbackEn: "Sets status=deleted. Not a permanent DB delete.",
    }),
    cancelLabel: t("common_cancel"),
    confirmLabel: t("common_confirm"),
  };

  const run = async (action: ActionType) => {
    setLoading(action);
    if (action === "bump") {
      const res = await updatePostBumpAdmin(product.id);
      setLoading(null);
      if (res.ok) onActionSuccess();
      else await dibayAlert({ title: res.ok === false ? res.error : t("admin_products_action_failed") });
      return;
    }

      const res = await confirmAndUpdateAdminPostStatus({
        action,
        product: {
          id: product.id,
          title: product.title,
          sellerLabel: product.seller?.nickname ?? product.sellerId,
          reservedBuyerId: product.reservedBuyerId,
          soldBuyerId: product.soldBuyerId,
        },
        labels: moderationLabels,
      });
    setLoading(null);
    if (res == null) return;
    if (res.ok) onActionSuccess();
    else await dibayAlert({ title: res.error || t("admin_products_action_failed") });
  };

  if (actions.length === 0) {
    return (
      <p className="sam-text-body text-sam-muted">
        {t("admin_products_deleted_no_actions")}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={loading !== null}
          onClick={() => void run(action)}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {loading === action ? t("admin_products_action_processing") : t(ACTION_LABEL_KEYS[action])}
        </button>
      ))}
    </div>
  );
}

"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useState } from "react";
import type { Product, ProductStatus } from "@/lib/types/product";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { updatePostStatusAdmin, updatePostBumpAdmin } from "@/lib/admin-posts/updatePostAdmin";

interface AdminProductActionPanelProps {
  product: Product;
  onActionSuccess: () => void;
}

type ActionType =
  | "hide"
  | "blind"
  | "restore"
  | "delete"
  | "mark_sold"
  | "mark_active"
  | "bump";

const ACTION_LABEL_KEYS: Record<ActionType, MessageKey> = {
  hide: "admin_products_action_hide",
  blind: "admin_products_action_blind",
  restore: "admin_products_action_restore",
  delete: "admin_products_action_delete",
  mark_sold: "admin_products_action_mark_sold",
  mark_active: "admin_products_action_mark_active",
  bump: "admin_products_action_bump",
};

/** DB posts.status 값 (blinded → hidden) */
function toDbStatus(productStatus: ProductStatus): string {
  if (productStatus === "blinded") return "hidden";
  return productStatus;
}

function getActions(status: ProductStatus): ActionType[] {
  switch (status) {
    case "active":
      return ["hide", "blind", "mark_sold", "bump"];
    case "reserved":
      return ["hide", "blind", "mark_sold", "mark_active", "bump"];
    case "sold":
      return ["hide", "blind", "mark_active", "bump"];
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
  const { t } = useI18n();
  const [loading, setLoading] = useState<ActionType | null>(null);
  const actions = getActions(product.status);

  const run = async (action: ActionType) => {
    setLoading(action);
    if (action === "bump") {
      const res = await updatePostBumpAdmin(product.id);
      setLoading(null);
      if (res.ok) onActionSuccess();
      else await dibayAlert({ title: res.ok === false ? res.error : t("admin_products_action_failed") });
      return;
    }
    let toStatus: string;
    switch (action) {
      case "hide":
        toStatus = "hidden";
        break;
      case "blind":
        toStatus = "hidden";
        break;
      case "restore":
        toStatus = "active";
        break;
      case "delete":
        toStatus = "deleted";
        break;
      case "mark_sold":
        toStatus = "sold";
        break;
      case "mark_active":
        toStatus = "active";
        break;
      default:
        setLoading(null);
        return;
    }
    const res = await updatePostStatusAdmin(product.id, toStatus as any);
    setLoading(null);
    if (res.ok) onActionSuccess();
    else await dibayAlert({ title: res.ok === false ? res.error : t("admin_products_action_failed") });
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
          onClick={() => run(action)}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {loading === action ? t("admin_products_action_processing") : t(ACTION_LABEL_KEYS[action])}
        </button>
      ))}
    </div>
  );
}

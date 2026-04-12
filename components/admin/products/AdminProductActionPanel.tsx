"use client";

import { useState } from "react";
import type { Product, ProductStatus } from "@/lib/types/product";
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

const ACTION_LABELS: Record<ActionType, string> = {
  hide: "숨김",
  blind: "블라인드",
  restore: "복구",
  delete: "삭제",
  mark_sold: "판매완료 처리",
  mark_active: "판매중 복구",
  bump: "끌올",
};

export function AdminProductActionPanel({
  product,
  onActionSuccess,
}: AdminProductActionPanelProps) {
  const [loading, setLoading] = useState<ActionType | null>(null);
  const actions = getActions(product.status);

  const run = async (action: ActionType) => {
    setLoading(action);
    if (action === "bump") {
      const res = await updatePostBumpAdmin(product.id);
      setLoading(null);
      if (res.ok) onActionSuccess();
      else alert(res.ok === false ? res.error : "처리 실패");
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
    else alert(res.ok === false ? res.error : "처리 실패");
  };

  if (actions.length === 0) {
    return (
      <p className="text-[14px] text-sam-muted">
        삭제된 상품은 추가 액션을 할 수 없습니다.
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
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {loading === action ? "처리 중..." : ACTION_LABELS[action]}
        </button>
      ))}
    </div>
  );
}

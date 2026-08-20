"use client";

/**
 * Shared confirm + reason for trade post soft moderation (LIGHTWEIGHT L2/L4).
 * Uses dibayConfirm / dibayPrompt — no new modal system.
 */

import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { updatePostStatusAdmin, type AdminUpdateResult } from "@/lib/admin-posts/updatePostAdmin";

export type AdminPostModerationAction =
  | "hide"
  | "restore"
  | "delete"
  | "mark_sold"
  | "mark_active";

export type AdminPostModerationProduct = {
  id: string;
  title: string;
  sellerLabel?: string;
  reservedBuyerId?: string | null;
  soldBuyerId?: string | null;
};

async function resolveSoldBuyerIdForAdmin(product: AdminPostModerationProduct): Promise<
  | { ok: true; soldBuyerId: string | null }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }
> {
  const existing =
    (typeof product.soldBuyerId === "string" && product.soldBuyerId.trim()) ||
    (typeof product.reservedBuyerId === "string" && product.reservedBuyerId.trim()) ||
    "";
  if (existing) return { ok: true, soldBuyerId: existing };

  try {
    const res = await fetch(`/api/admin/posts/${encodeURIComponent(product.id)}/buyers`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      uniqueBuyerIds?: string[];
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? "구매자 목록을 불러오지 못했습니다." };
    }
    const ids = Array.isArray(data.uniqueBuyerIds) ? data.uniqueBuyerIds.filter(Boolean) : [];
    if (ids.length === 1) return { ok: true, soldBuyerId: ids[0]! };
    if (ids.length === 0) {
      return {
        ok: false,
        error:
          "판매 확정 구매자가 없습니다. 거래 채팅이 있는 구매자를 지정할 수 있을 때만 판매완료할 수 있습니다.",
      };
    }
    const picked = await dibayPrompt({
      title: "판매 확정 구매자 UUID",
      description: `후보 ${ids.length}명:\n${ids.map((id) => `· ${id}`).join("\n")}`,
      placeholder: "buyer UUID",
      required: true,
      confirmTone: "destructive",
    });
    if (picked == null) return { ok: false, cancelled: true };
    const buyerId = picked.trim();
    if (!ids.includes(buyerId)) {
      return { ok: false, error: "후보 목록에 없는 구매자 ID입니다." };
    }
    return { ok: true, soldBuyerId: buyerId };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "구매자 확인 실패" };
  }
}

/**
 * Prompt/confirm then update. Returns null if user cancelled.
 */
export async function confirmAndUpdateAdminPostStatus(args: {
  action: AdminPostModerationAction;
  product: AdminPostModerationProduct;
  labels: {
    hideTitle: string;
    restoreTitle: string;
    deleteTitle: string;
    markSoldTitle: string;
    markActiveTitle: string;
    reasonPlaceholder: string;
    softDeleteHint: string;
    cancelLabel: string;
    confirmLabel: string;
  };
}): Promise<AdminUpdateResult | null> {
  const { action, product, labels } = args;
  const titleSnippet = `${product.title.slice(0, 48)}${product.title.length > 48 ? "…" : ""}`;
  const meta = [
    `POST ${product.id}`,
    titleSnippet,
    product.sellerLabel ? `Seller: ${product.sellerLabel}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (action === "hide") {
    const reason = await dibayPrompt({
      title: labels.hideTitle,
      description: meta,
      placeholder: labels.reasonPlaceholder,
      required: true,
      confirmTone: "destructive",
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (reason == null) return null;
    return updatePostStatusAdmin(product.id, "hidden", { reason });
  }

  if (action === "delete") {
    const reason = await dibayPrompt({
      title: labels.deleteTitle,
      description: `${meta}\n\n${labels.softDeleteHint}`,
      placeholder: labels.reasonPlaceholder,
      required: true,
      confirmTone: "destructive",
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (reason == null) return null;
    return updatePostStatusAdmin(product.id, "deleted", { reason });
  }

  if (action === "restore") {
    const ok = await dibayConfirm({
      title: labels.restoreTitle,
      description: meta,
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (!ok) return null;
    return updatePostStatusAdmin(product.id, "active", { reason: null });
  }

  if (action === "mark_active") {
    const ok = await dibayConfirm({
      title: labels.markActiveTitle,
      description: meta,
      cancelLabel: labels.cancelLabel,
      confirmLabel: labels.confirmLabel,
    });
    if (!ok) return null;
    return updatePostStatusAdmin(product.id, "active", { reason: null });
  }

  // mark_sold — require sold_buyer identity (L4)
  const buyer = await resolveSoldBuyerIdForAdmin(product);
  if (!buyer.ok) {
    if ("cancelled" in buyer && buyer.cancelled) return null;
    await dibayAlert({ title: "error" in buyer ? buyer.error : "판매완료 불가" });
    return null;
  }

  const reason = await dibayPrompt({
    title: labels.markSoldTitle,
    description: `${meta}\nBuyer: ${buyer.soldBuyerId}`,
    placeholder: labels.reasonPlaceholder,
    required: false,
    confirmTone: "destructive",
    cancelLabel: labels.cancelLabel,
    confirmLabel: labels.confirmLabel,
  });
  if (reason == null) return null;
  return updatePostStatusAdmin(product.id, "sold", {
    reason: reason.trim() || null,
    soldBuyerId: buyer.soldBuyerId,
  });
}

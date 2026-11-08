"use client";

/**
 * 충전 신청 처리 (공통 충전 화면·커뮤니티 충전 화면 공용) — 설계 v2 §F-3-3.
 * 승인 = 입금 확인 근거 필수 (L2) · 반려 = 사유 필수 (L2, 회원에게 전달) · 보류 = 확인 (L1).
 */
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

export type PointChargeAction = "approve" | "reject" | "hold";

export type PointChargeActionResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string };

export async function runPointChargeAction(input: {
  requestId: string;
  action: PointChargeAction;
  ko: boolean;
  /** 확인창에 보여 줄 요약 (예: "홍길동 · 1,000P · ₱1,000") */
  summary: string;
  adminMemo?: string;
  /** 거래 Admin(O-2)은 `/api/admin/trade/point-charges` — 같은 공용 처리 */
  apiBase?: string;
}): Promise<PointChargeActionResult> {
  const { ko, action } = input;
  const tr = (key: MessageKey, vars?: Record<string, unknown>) => translateBy(ko ? "ko" : "en", key, vars);
  let verificationNote: string | undefined;
  let rejectReason: string | undefined;

  if (action === "approve") {
    const c = await confirmAdminAction({
      level: adminActionLevel("moneyApprove"),
      ko,
      title: tr("admin_points_approve_after_verifying_payment"),
      description: tr("admin_points_approve_charge_confirm", { summary: input.summary }),
      confirmLabel: tr("admin_points_approve"),
      reasonPlaceholder: tr("admin_points_10_19_14_05_bdo_ref"),
    });
    if (!c.ok) return { ok: false, cancelled: true };
    verificationNote = c.reason ?? undefined;
  } else if (action === "reject") {
    const c = await confirmAdminAction({
      level: adminActionLevel("reject"),
      ko,
      title: tr("admin_points_reject_top_up"),
      description: tr("admin_points_reject_charge_confirm", { summary: input.summary }),
      confirmLabel: tr("admin_points_action_reject"),
      destructive: true,
      reasonPlaceholder: tr("admin_points_payment_not_found"),
    });
    if (!c.ok) return { ok: false, cancelled: true };
    rejectReason = c.reason ?? undefined;
  } else {
    const c = await confirmAdminAction({
      level: adminActionLevel("hold"),
      ko,
      title: tr("admin_points_put_top_up_on_hold"),
      description: input.summary,
      confirmLabel: tr("admin_points_action_hold"),
    });
    if (!c.ok) return { ok: false, cancelled: true };
  }

  const res = await fetch(`${input.apiBase ?? "/api/admin/point-charges"}/${encodeURIComponent(input.requestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action,
      ...(input.adminMemo !== undefined ? { adminMemo: input.adminMemo } : {}),
      ...(verificationNote ? { verificationNote } : {}),
      ...(rejectReason ? { rejectReason } : {}),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "action_failed" };
  return { ok: true };
}

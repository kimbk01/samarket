"use client";

/**
 * 충전 신청 처리 (공통 충전 화면·커뮤니티 충전 화면 공용) — 설계 v2 §F-3-3.
 * 승인 = 입금 확인 근거 필수 (L2) · 반려 = 사유 필수 (L2, 회원에게 전달) · 보류 = 확인 (L1).
 */
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";

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
}): Promise<PointChargeActionResult> {
  const { ko, action } = input;
  let verificationNote: string | undefined;
  let rejectReason: string | undefined;

  if (action === "approve") {
    const c = await confirmAdminAction({
      level: "L2",
      ko,
      title: ko ? "입금 확인 후 승인" : "Approve after verifying payment",
      description: ko
        ? `${input.summary}\n실제 입금을 확인한 근거(입금 시각·은행 거래 참조번호 등)를 입력하세요. 승인하면 포인트가 바로 지급되고 되돌릴 수 없습니다.`
        : `${input.summary}\nEnter how you verified the payment (time, bank reference). Points are credited immediately and cannot be reversed.`,
      confirmLabel: ko ? "입금 확인 후 승인" : "Approve",
      reasonPlaceholder: ko ? "예: 10/19 14:05 BDO 입금 확인, 참조 123456" : "e.g. 10/19 14:05 BDO ref 123456",
    });
    if (!c.ok) return { ok: false, cancelled: true };
    verificationNote = c.reason ?? undefined;
  } else if (action === "reject") {
    const c = await confirmAdminAction({
      level: "L2",
      ko,
      title: ko ? "충전 신청 반려" : "Reject top-up",
      description: ko
        ? `${input.summary}\n반려 사유는 회원에게 알림으로 전달됩니다.`
        : `${input.summary}\nThe reason is sent to the member.`,
      confirmLabel: ko ? "반려" : "Reject",
      destructive: true,
      reasonPlaceholder: ko ? "예: 입금 내역을 찾을 수 없습니다" : "e.g. Payment not found",
    });
    if (!c.ok) return { ok: false, cancelled: true };
    rejectReason = c.reason ?? undefined;
  } else {
    const c = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "충전 신청 보류" : "Put top-up on hold",
      description: input.summary,
      confirmLabel: ko ? "보류" : "Hold",
    });
    if (!c.ok) return { ok: false, cancelled: true };
  }

  const res = await fetch(`/api/admin/point-charges/${encodeURIComponent(input.requestId)}`, {
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

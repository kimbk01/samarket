/**
 * Admin CTA 확인 등급 (R1 공통 기준)
 * L1 확인 · L2 확인 + 사유 필수 · L3 확인 + 사유 + 대상 재입력.
 * 화면은 이 함수 결과(`ok` / `reason`)만 사용하고, 서버도 같은 사유 규칙을 검증한다.
 */

import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";

export const ADMIN_REASON_MIN_LENGTH = 2;

export type AdminConfirmLevel = "L1" | "L2" | "L3";

export async function confirmAdminAction(input: {
  level: AdminConfirmLevel;
  ko: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  /** L3: 운영자가 다시 입력해야 하는 값 (주문번호·매장명 등) */
  retypeValue?: string;
  reasonPlaceholder?: string;
}): Promise<{ ok: false } | { ok: true; reason: string | null }> {
  const cancelLabel = input.ko ? "취소" : "Cancel";
  const confirmTone = input.destructive ? ("destructive" as const) : ("primary" as const);
  if (input.level === "L1") {
    const ok = await dibayConfirm({
      title: input.title,
      description: input.description,
      confirmLabel: input.confirmLabel,
      cancelLabel,
      confirmTone,
    });
    return ok ? { ok: true, reason: null } : { ok: false };
  }
  const raw = await dibayPrompt({
    title: input.title,
    description: [
      input.description,
      input.ko
        ? "처리 사유를 입력하세요 (2자 이상). 작업 기록에 남습니다."
        : "Enter a reason (2+ characters). It is recorded in the activity log.",
    ]
      .filter(Boolean)
      .join("\n"),
    placeholder: input.reasonPlaceholder ?? (input.ko ? "처리 사유" : "Reason"),
    confirmLabel: input.confirmLabel,
    cancelLabel,
    confirmTone,
    required: true,
  });
  if (raw === null) return { ok: false };
  const reason = raw.trim();
  if (reason.length < ADMIN_REASON_MIN_LENGTH) return { ok: false };
  if (input.level === "L3" && input.retypeValue) {
    const typed = await dibayPrompt({
      title: input.ko ? "한 번 더 확인합니다" : "Confirm once more",
      description: input.ko
        ? `계속하려면 「${input.retypeValue}」을(를) 그대로 입력하세요.`
        : `Type "${input.retypeValue}" to continue.`,
      placeholder: input.retypeValue,
      confirmLabel: input.confirmLabel,
      cancelLabel,
      confirmTone,
      required: true,
    });
    if (typed === null || typed.trim() !== input.retypeValue.trim()) return { ok: false };
  }
  return { ok: true, reason };
}

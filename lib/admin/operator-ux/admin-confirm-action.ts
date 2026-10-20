/**
 * Admin CTA 확인 등급 (R1 공통 기준 · 수정 계획 2-3)
 * L0 확인 없음(조회·필터·새로고침·상세) · L1 확인 · L2 확인 + 사유 필수 · L3 확인 + 사유 + 대상 재입력.
 * 화면은 이 함수 결과(`ok` / `reason`)만 사용하고, 서버도 같은 사유 규칙을 검증한다.
 * 관리자 셸 안에서는 셸의 `AdminConfirmHost`(AdminActionConfirmDialog 하나)에 사유·재입력을 한 화면으로 띄운다.
 * 셸 밖(호스트 없음)에서만 앱 공용 대화상자로 순서대로 묻는다.
 */

import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { openAdminConfirmHost } from "@/lib/admin/operator-ux/admin-confirm-host";

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
  const hosted = openAdminConfirmHost({
    title: input.title,
    description: [
      input.description,
      input.level === "L1"
        ? null
        : input.ko
          ? `처리 사유를 입력하세요 (${ADMIN_REASON_MIN_LENGTH}자 이상). 작업 기록에 남습니다.`
          : `Enter a reason (${ADMIN_REASON_MIN_LENGTH}+ characters). It is recorded in the activity log.`,
    ]
      .filter(Boolean)
      .join("\n"),
    confirmLabel: input.confirmLabel,
    cancelLabel,
    tone: input.destructive ? "danger" : "primary",
    reasonRequired: input.level !== "L1",
    reasonMinLength: ADMIN_REASON_MIN_LENGTH,
    reasonLabel: input.ko ? "처리 사유" : "Reason",
    reasonPlaceholder: input.reasonPlaceholder ?? (input.ko ? "처리 사유" : "Reason"),
    confirmMatchText: input.level === "L3" && input.retypeValue ? input.retypeValue : undefined,
    confirmMatchLabel:
      input.level === "L3" && input.retypeValue
        ? input.ko
          ? `계속하려면 「${input.retypeValue}」을(를) 그대로 입력하세요`
          : `Type "${input.retypeValue}" to continue`
        : undefined,
  });
  if (hosted) {
    const r = await hosted;
    if (!r.ok) return { ok: false };
    return { ok: true, reason: input.level === "L1" ? null : r.reason.trim() };
  }

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
    // 2자 미만이면 확인 버튼을 막고 안내한다 (예전: 확인 후 아무 안내 없이 취소되던 결함).
    minLength: ADMIN_REASON_MIN_LENGTH,
    invalidHint: input.ko
      ? `사유를 ${ADMIN_REASON_MIN_LENGTH}자 이상 입력하세요.`
      : `Enter at least ${ADMIN_REASON_MIN_LENGTH} characters.`,
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
      // 일치할 때만 확인 가능 (예전: 불일치 시 안내 없이 취소되던 결함).
      mustEqual: input.retypeValue,
      invalidHint: input.ko ? "입력값이 일치해야 진행됩니다." : "The value must match to continue.",
    });
    if (typed === null || typed.trim() !== input.retypeValue.trim()) return { ok: false };
  }
  return { ok: true, reason };
}

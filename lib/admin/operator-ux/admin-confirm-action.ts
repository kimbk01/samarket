/**
 * Admin CTA 확인 등급 (R1 공통 기준 · 수정 계획 2-3)
 * L0 확인 없음(조회·필터·새로고침·상세) · L1 확인 · L2 확인 + 사유 필수 · L3 확인 + 사유 (+ 광고 밖만 대상 재입력).
 * 광고 조치는 `action`(광고 동작 · `ADMIN_AD_REASON_ONLY_ACTIONS`)으로 부르면 재입력이 없다 — `retypeValue` 를 넘겨도 무시한다
 * (SSOT §3-1 · Owner 2026-11-07). 광고 밖 돈 조치(Apple IAP 회수 등)는 `level: "L3"` + `retypeValue` 그대로 재입력을 묻는다.
 * 화면은 이 함수 결과(`ok` / `reason`)만 사용하고, 서버도 같은 사유 규칙을 검증한다.
 * 관리자 셸 안에서는 셸의 `AdminConfirmHost`(AdminActionConfirmDialog 하나)에 사유·재입력을 한 화면으로 띄운다.
 * 셸 밖(호스트 없음)에서만 앱 공용 대화상자로 순서대로 묻는다.
 */

import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { openAdminConfirmHost } from "@/lib/admin/operator-ux/admin-confirm-host";
import {
  adminActionAllowsRetype,
  adminActionLevel,
  type AdminActionKind,
} from "@/lib/admin/operator-ux/admin-action-levels";

import { ADMIN_PUBLIC_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/operator-ux/admin-reason";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export { ADMIN_REASON_MIN_LENGTH };

export type AdminConfirmLevel = "L1" | "L2" | "L3";

type ConfirmAdminActionInput = {
  ko: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  /** L3: 운영자가 다시 입력해야 하는 값 (주문번호·매장명 등) */
  retypeValue?: string;
  reasonPlaceholder?: string;
  /** D-6: 공개 사유(120자) + 내부 메모 두 칸 (L2·L3 만). 결과에 `internalMemo` 가 붙는다. */
  splitReason?: boolean;
} & (
  | {
      level: AdminConfirmLevel;
      /** 동작 종류 — 주면 재입력 허용 여부를 동작 표에서 정한다(광고 조치 = 재입력 없음). */
      action?: AdminActionKind;
    }
  | {
      /** 동작 종류만 주면 단계도 동작 표(`adminActionLevel`)에서 정한다. */
      action: AdminActionKind;
      level?: undefined;
    }
);

/** 입력 → 실제 단계·재입력 값. 광고 조치(`action`)는 재입력 없음. 순수 함수 (시험용 export). */
export function resolveAdminConfirmPlan(input: {
  level?: AdminConfirmLevel;
  action?: AdminActionKind;
  retypeValue?: string;
}): { level: AdminConfirmLevel; retypeValue: string | undefined } {
  const level: AdminConfirmLevel = input.action ? adminActionLevel(input.action) : (input.level ?? "L1");
  const retypeAllowed = level === "L3" && (input.action ? adminActionAllowsRetype(input.action) : true);
  const retype = retypeAllowed && input.retypeValue?.trim() ? input.retypeValue : undefined;
  return { level, retypeValue: retype };
}

export async function confirmAdminAction(
  rawInput: ConfirmAdminActionInput
): Promise<{ ok: false } | { ok: true; reason: string | null; internalMemo?: string | null }> {
  const plan = resolveAdminConfirmPlan(rawInput);
  const input = { ...rawInput, level: plan.level, retypeValue: plan.retypeValue };
  const split = Boolean(input.splitReason) && input.level !== "L1";
  const cancelLabel = tx(input.ko, "common_cancel");
  const hosted = openAdminConfirmHost({
    title: input.title,
    description: [
      input.description,
      input.level === "L1"
        ? null
        : split
          ? tx(input.ko, "admin_operator_ux_the_public_reason_is_shown_to", { min: String(ADMIN_REASON_MIN_LENGTH), max: String(ADMIN_PUBLIC_REASON_MAX_LENGTH) })
        : tx(input.ko, "admin_operator_ux_enter_a_reason_characters_it_is", { min: String(ADMIN_REASON_MIN_LENGTH) }),
    ]
      .filter(Boolean)
      .join("\n"),
    confirmLabel: input.confirmLabel,
    cancelLabel,
    tone: input.destructive ? "danger" : "primary",
    reasonRequired: input.level !== "L1",
    reasonMinLength: ADMIN_REASON_MIN_LENGTH,
    reasonLabel: split
      ? tx(input.ko, "admin_operator_ux_public_reason_shown_to_member_owner", { max: String(ADMIN_PUBLIC_REASON_MAX_LENGTH) })
      : tx(input.ko, "admin_operator_ux_reason"),
    reasonPlaceholder: input.reasonPlaceholder ?? tx(input.ko, "admin_operator_ux_reason"),
    confirmMatchText: input.level === "L3" && input.retypeValue ? input.retypeValue : undefined,
    confirmMatchLabel:
      input.level === "L3" && input.retypeValue
        ? tx(input.ko, "admin_operator_ux_type_to_continue", { retypeValue: String(input.retypeValue) })
        : undefined,
    ...(split ? { splitReason: true } : {}),
  });
  if (hosted) {
    const r = await hosted;
    if (!r.ok) return { ok: false };
    if (split) {
      const memo = (r.internalMemo ?? "").trim();
      return {
        ok: true,
        reason: r.reason.trim().slice(0, ADMIN_PUBLIC_REASON_MAX_LENGTH),
        internalMemo: memo || null,
      };
    }
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
      tx(input.ko, "admin_operator_ux_enter_a_reason_2_characters_it"),
    ]
      .filter(Boolean)
      .join("\n"),
    placeholder: input.reasonPlaceholder ?? tx(input.ko, "admin_operator_ux_reason"),
    confirmLabel: input.confirmLabel,
    cancelLabel,
    confirmTone,
    required: true,
    // 2자 미만이면 확인 버튼을 막고 안내한다 (예전: 확인 후 아무 안내 없이 취소되던 결함).
    minLength: ADMIN_REASON_MIN_LENGTH,
    invalidHint: tx(input.ko, "admin_operator_ux_enter_at_least_characters", { min: String(ADMIN_REASON_MIN_LENGTH) }),
  });
  if (raw === null) return { ok: false };
  const reason = raw.trim();
  if (reason.length < ADMIN_REASON_MIN_LENGTH) return { ok: false };
  if (input.level === "L3" && input.retypeValue) {
    const typed = await dibayPrompt({
      title: tx(input.ko, "admin_operator_ux_confirm_once_more"),
      description: tx(input.ko, "admin_operator_ux_type_to_continue_sentence", { retypeValue: String(input.retypeValue) }),
      placeholder: input.retypeValue,
      confirmLabel: input.confirmLabel,
      cancelLabel,
      confirmTone,
      required: true,
      // 일치할 때만 확인 가능 (예전: 불일치 시 안내 없이 취소되던 결함).
      mustEqual: input.retypeValue,
      invalidHint: tx(input.ko, "admin_operator_ux_the_value_must_match_to_continue"),
    });
    if (typed === null || typed.trim() !== input.retypeValue.trim()) return { ok: false };
  }
  // 셸 밖 대체 경로는 공개 사유 한 칸만 묻는다 (내부 메모 없음).
  if (split) return { ok: true, reason: reason.slice(0, ADMIN_PUBLIC_REASON_MAX_LENGTH), internalMemo: null };
  return { ok: true, reason };
}

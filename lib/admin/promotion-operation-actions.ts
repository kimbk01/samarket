/**
 * CUT 3 — Admin Promotion action semantics (UI metadata only).
 * Does not create a second business workflow state machine.
 */

import type { AdminActionVariant } from "@/components/admin/ui/AdminActionButton";

export const PROMOTION_ADMIN_ACTIONS = [
  "CREATE",
  "SAVE",
  "PREVIEW",
  "CONFIGURE_EXPOSURE",
  "PUBLISH",
  "SCHEDULE",
  "ACTIVATE",
  "PAUSE_STOP",
  "SEND_PUSH",
  "APPROVE",
  "REQUEST_REVISION",
  "REJECT",
] as const;

export type PromotionAdminAction = (typeof PROMOTION_ADMIN_ACTIONS)[number];

export type PromotionAdminActionMeta = {
  id: PromotionAdminAction;
  /** Visual hierarchy — maps to AdminActionButton variant */
  variant: AdminActionVariant;
  labelKo: string;
  labelEn: string;
  /** Customer-visible side effect when performed */
  customerVisible: boolean;
  /** Requires confirm dialog when true */
  confirm: boolean;
  /**
   * Authority note — existing writer only; CUT 3 does not invent writers.
   */
  authorityNote: string;
};

export const PROMOTION_ADMIN_ACTION_META: Record<
  PromotionAdminAction,
  PromotionAdminActionMeta
> = {
  CREATE: {
    id: "CREATE",
    variant: "primary",
    labelKo: "새 이벤트 만들기",
    labelEn: "Create event",
    customerVisible: false,
    confirm: false,
    authorityNote: "POST /api/admin/platform-events",
  },
  SAVE: {
    id: "SAVE",
    variant: "primary",
    labelKo: "저장",
    labelEn: "Save",
    customerVisible: false,
    confirm: false,
    authorityNote: "PATCH event / distribution / popup campaign save",
  },
  PREVIEW: {
    id: "PREVIEW",
    variant: "secondary",
    labelKo: "미리보기",
    labelEn: "Preview",
    customerVisible: false,
    confirm: false,
    authorityNote: "Admin preview only",
  },
  CONFIGURE_EXPOSURE: {
    id: "CONFIGURE_EXPOSURE",
    variant: "secondary",
    labelKo: "노출 설정",
    labelEn: "Configure exposure",
    customerVisible: false,
    confirm: false,
    authorityNote: "Event distribution panel / PUT distribution",
  },
  PUBLISH: {
    id: "PUBLISH",
    variant: "primary",
    labelKo: "게시",
    labelEn: "Publish",
    customerVisible: true,
    confirm: true,
    authorityNote: "PATCH platform-events status=published",
  },
  SCHEDULE: {
    id: "SCHEDULE",
    variant: "primary",
    labelKo: "예약",
    labelEn: "Schedule",
    customerVisible: false,
    confirm: false,
    authorityNote: "Publish with future startsAt",
  },
  ACTIVATE: {
    id: "ACTIVATE",
    variant: "primary",
    labelKo: "노출 시작",
    labelEn: "Start exposure",
    customerVisible: true,
    confirm: true,
    authorityNote: "Popup activate / Dist enable — not Save, not Approve, not Push send",
  },
  PAUSE_STOP: {
    id: "PAUSE_STOP",
    variant: "danger",
    labelKo: "노출 중지",
    labelEn: "Stop exposure",
    customerVisible: true,
    confirm: true,
    authorityNote: "Event unpublished / popup pause / Dist banner OFF",
  },
  SEND_PUSH: {
    id: "SEND_PUSH",
    variant: "danger",
    labelKo: "Push 보내기",
    labelEn: "Send push",
    customerVisible: true,
    confirm: true,
    authorityNote: "Notification campaign send — SAVE ≠ SEND; Publish ≠ Send",
  },
  APPROVE: {
    id: "APPROVE",
    variant: "primary",
    labelKo: "승인",
    labelEn: "Approve",
    customerVisible: false,
    confirm: true,
    authorityNote: "Approval workflow only — not Activate, not Publish, not Send",
  },
  REQUEST_REVISION: {
    id: "REQUEST_REVISION",
    variant: "secondary",
    labelKo: "수정 요청",
    labelEn: "Request revision",
    customerVisible: false,
    confirm: false,
    authorityNote: "Owner request revision action",
  },
  REJECT: {
    id: "REJECT",
    variant: "danger",
    labelKo: "거절",
    labelEn: "Reject",
    customerVisible: false,
    confirm: true,
    authorityNote: "Owner request reject",
  },
};

export function promotionAdminActionLabel(
  action: PromotionAdminAction,
  lang: "ko" | "en"
): string {
  const meta = PROMOTION_ADMIN_ACTION_META[action];
  return lang === "en" ? meta.labelEn : meta.labelKo;
}

/** Invariant: saving a push draft must never equal send. */
export function assertSaveIsNotSend(): boolean {
  return (
    PROMOTION_ADMIN_ACTION_META.SAVE.customerVisible === false &&
    PROMOTION_ADMIN_ACTION_META.SEND_PUSH.customerVisible === true &&
    PROMOTION_ADMIN_ACTION_META.SAVE.id !== PROMOTION_ADMIN_ACTION_META.SEND_PUSH.id
  );
}

/** Invariant: owner approve is not publish/send. */
export function assertApproveIsNotPublishOrSend(): boolean {
  return (
    PROMOTION_ADMIN_ACTION_META.APPROVE.customerVisible === false &&
    PROMOTION_ADMIN_ACTION_META.PUBLISH.customerVisible === true &&
    PROMOTION_ADMIN_ACTION_META.SEND_PUSH.customerVisible === true
  );
}

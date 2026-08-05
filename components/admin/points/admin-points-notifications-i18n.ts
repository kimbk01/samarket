import type { MessageKey } from "@/lib/i18n/messages";
import type { PointChargeRequestStatus, PointPaymentMethod, PointLedgerEntryType } from "@/lib/types/point";
import type { PointExpireRunCycle, PointExpireExecutionStatus } from "@/lib/types/point-expire";
import type {
  PointRewardActionType,
  PointRewardExecutionStatus,
  PointReclaimTriggerType,
  PointReclaimMode,
} from "@/lib/types/point-execution";
import type { PointRewardType } from "@/lib/types/point-policy";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

export const ADMIN_POINTS_BOARD_KEYS: Record<string, MessageKey> = {
  general: "admin_points_board_general",
  qna: "admin_points_board_qna",
  trade_tips: "admin_points_board_trade_tips",
};

export const ADMIN_POINTS_CHARGE_STATUS_KEYS: Record<PointChargeRequestStatus, MessageKey> = {
  pending: "admin_points_charge_status_pending",
  waiting_confirm: "admin_points_charge_status_waiting_confirm",
  on_hold: "admin_points_charge_status_on_hold",
  approved: "admin_points_charge_status_approved",
  rejected: "admin_points_charge_status_rejected",
  cancelled: "admin_points_charge_status_cancelled",
};

export const ADMIN_POINTS_PAYMENT_METHOD_KEYS: Record<PointPaymentMethod, MessageKey> = {
  bank_transfer: "admin_points_payment_bank_transfer",
  gcash: "admin_points_payment_gcash",
  manual_confirm: "admin_points_payment_manual_confirm",
};

export const ADMIN_POINTS_LEDGER_TYPE_KEYS: Record<PointLedgerEntryType, MessageKey> = {
  charge: "admin_points_ledger_type_charge",
  spend: "admin_points_ledger_type_spend",
  refund: "admin_points_ledger_type_refund",
  admin_adjust: "admin_points_ledger_type_admin_adjust",
  admin_credit: "admin_points_ledger_type_admin_credit",
  admin_debit: "admin_points_ledger_type_admin_debit",
  expire: "admin_points_ledger_type_expire",
  reward: "admin_points_ledger_type_reward",
  reverse: "admin_points_ledger_type_reverse",
  ad_purchase: "admin_points_ledger_type_ad_purchase",
  ad_refund: "admin_points_ledger_type_ad_refund",
  ad_hold: "admin_points_ledger_type_ad_hold",
  ad_hold_release: "admin_points_ledger_type_ad_hold_release",
  ad_charge: "admin_points_ledger_type_ad_charge",
};

export const ADMIN_POINTS_EXPIRE_CYCLE_KEYS: Record<PointExpireRunCycle, MessageKey> = {
  daily: "admin_points_expire_cycle_daily",
  weekly: "admin_points_expire_cycle_weekly",
  monthly: "admin_points_expire_cycle_monthly",
};

export const ADMIN_POINTS_EXPIRE_EXEC_STATUS_KEYS: Record<PointExpireExecutionStatus, MessageKey> = {
  simulated: "admin_points_expire_exec_simulated",
  success: "admin_points_expire_exec_success",
  skipped: "admin_points_expire_exec_skipped",
  failed: "admin_points_expire_exec_failed",
};

export const ADMIN_POINTS_REWARD_TYPE_KEYS: Record<PointRewardType, MessageKey> = {
  fixed: "admin_points_reward_type_fixed",
  random: "admin_points_reward_type_random",
};

export const ADMIN_POINTS_ACTION_TYPE_KEYS: Record<PointRewardActionType, MessageKey> = {
  write: "admin_points_action_write",
  comment: "admin_points_action_comment",
};

export const ADMIN_POINTS_EXEC_STATUS_KEYS: Record<PointRewardExecutionStatus, MessageKey> = {
  success: "admin_points_exec_status_success",
  blocked: "admin_points_exec_status_blocked",
  reversed: "admin_points_exec_status_reversed",
};

export const ADMIN_POINTS_RECLAIM_TRIGGER_KEYS: Record<PointReclaimTriggerType, MessageKey> = {
  delete: "admin_points_reclaim_trigger_delete",
  admin_remove: "admin_points_reclaim_trigger_admin_remove",
  report_confirmed: "admin_points_reclaim_trigger_report_confirmed",
};

export const ADMIN_POINTS_RECLAIM_MODE_KEYS: Record<PointReclaimMode, MessageKey> = {
  full: "admin_points_reclaim_mode_full",
  partial: "admin_points_reclaim_mode_partial",
};

export const ADMIN_POINTS_USER_TYPE_KEYS: Record<"free" | "premium", MessageKey> = {
  free: "admin_points_user_type_free",
  premium: "admin_points_user_type_premium",
};

export const ADMIN_NOTIF_STATUS_KEYS: Record<string, MessageKey> = {
  draft: "admin_notif_status_draft",
  scheduled: "admin_notif_status_scheduled",
  sending: "admin_notif_status_sending",
  sent: "admin_notif_status_sent",
  partially_failed: "admin_notif_status_partially_failed",
  failed: "admin_notif_status_failed",
  cancelled: "admin_notif_status_cancelled",
};

export const ADMIN_NOTIF_CHANNEL_KEYS: Record<string, MessageKey> = {
  push_only: "admin_notif_channel_push_only",
  in_app_only: "admin_notif_channel_in_app_only",
  push_and_in_app: "admin_notif_channel_push_and_in_app",
  test_only: "admin_notif_channel_test_only",
};

export const ADMIN_NOTIF_TYPE_KEYS: Record<string, MessageKey> = {
  notice: "admin_notif_type_notice",
  marketing: "admin_notif_type_marketing",
  system: "admin_notif_type_system",
};

export const ADMIN_NOTIF_TARGET_KEYS: Record<string, MessageKey> = {
  all: "admin_notif_target_all",
  marketing_opt_in: "admin_notif_target_marketing_opt_in",
  active_users: "admin_notif_target_active_users",
  region: "admin_notif_target_region",
  selected_users: "admin_notif_target_selected_users",
  segment: "admin_notif_target_segment",
};

export function pointBoardLabel(t: TFn, boardKey: string): string {
  const key = ADMIN_POINTS_BOARD_KEYS[boardKey];
  return key ? t(key) : boardKey;
}

export function pointChargeStatusLabel(t: TFn, status: PointChargeRequestStatus): string {
  return t(ADMIN_POINTS_CHARGE_STATUS_KEYS[status]);
}

export function pointPaymentMethodLabel(t: TFn, method: PointPaymentMethod): string {
  return t(ADMIN_POINTS_PAYMENT_METHOD_KEYS[method]);
}

export function pointLedgerTypeLabel(t: TFn, type: PointLedgerEntryType): string {
  return t(ADMIN_POINTS_LEDGER_TYPE_KEYS[type]);
}

export function pointExpireCycleLabel(t: TFn, cycle: PointExpireRunCycle): string {
  return t(ADMIN_POINTS_EXPIRE_CYCLE_KEYS[cycle]);
}

export function pointExpireExecStatusLabel(t: TFn, status: PointExpireExecutionStatus): string {
  return t(ADMIN_POINTS_EXPIRE_EXEC_STATUS_KEYS[status]);
}

export function pointRewardTypeLabel(t: TFn, type: PointRewardType): string {
  return t(ADMIN_POINTS_REWARD_TYPE_KEYS[type]);
}

export function pointActionTypeLabel(t: TFn, action: PointRewardActionType): string {
  return t(ADMIN_POINTS_ACTION_TYPE_KEYS[action]);
}

export function pointExecStatusLabel(t: TFn, status: PointRewardExecutionStatus): string {
  return t(ADMIN_POINTS_EXEC_STATUS_KEYS[status]);
}

export function pointUserTypeLabel(t: TFn, userType: "free" | "premium"): string {
  return t(ADMIN_POINTS_USER_TYPE_KEYS[userType]);
}

export function notifChannelLabel(t: TFn, channel: string): string {
  const key = ADMIN_NOTIF_CHANNEL_KEYS[channel];
  return key ? t(key) : channel;
}

export function notifStatusLabel(t: TFn, status: string): string {
  const key = ADMIN_NOTIF_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function notifTypeLabel(t: TFn, type: string): string {
  const key = ADMIN_NOTIF_TYPE_KEYS[type];
  return key ? t(key) : type;
}

export function notifTargetLabel(t: TFn, target: string): string {
  const key = ADMIN_NOTIF_TARGET_KEYS[target];
  return key ? t(key) : target;
}

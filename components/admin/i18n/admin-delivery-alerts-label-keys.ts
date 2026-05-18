import type { MessageKey } from "@/lib/i18n/messages";

export const AUTO_ACTION_TYPE_KEYS: Record<string, MessageKey> = {
  "": "admin_del_alert_auto_off",
  auto_hold_settlement: "admin_del_alert_auto_hold_settlement",
  auto_flag_order: "admin_del_alert_auto_flag_order",
  auto_reassign_rider: "admin_del_alert_auto_reassign_rider",
  auto_escalate: "admin_del_alert_auto_escalate",
  auto_assign_admin: "admin_del_alert_auto_assign_admin",
  auto_mark_attention: "admin_del_alert_auto_mark_attention",
  auto_mute: "admin_del_alert_auto_mute",
};

export const DELIVERY_ALERT_BANNER_KEYS: Record<string, MessageKey> = {
  kill_switch_off: "admin_del_alert_banner_kill_switch_off",
  dangerous_instant_execution_risk: "admin_del_alert_banner_dangerous_instant",
  stale_pending_approval: "admin_del_alert_banner_stale_pending",
  failed_actions_need_attention: "admin_del_alert_banner_failed_retry",
  today_failed_present: "admin_del_alert_banner_today_failed",
  possible_operator_backlog: "admin_del_alert_banner_operator_backlog",
};

export function resolveDeliveryAlertBannerLabel(
  t: (key: MessageKey) => string,
  code: string
): string {
  const key = DELIVERY_ALERT_BANNER_KEYS[code];
  return key ? t(key) : code;
}

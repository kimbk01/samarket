/** RPC `admin_delivery_operation_recovery_execute` 와 동일한 화이트리스트 */

export const DELIVERY_OPERATION_RECOVERY_ACTIONS = [
  "sla_scan",
  "alert_sync",
  "auto_action_runner",
  "alert_pipeline",
  "stale_alerts_resolve",
  "waiting_rider_bump",
  "delivering_mark_attention",
  "bulk_retry_failed_auto_actions",
] as const;

export type DeliveryOperationRecoveryAction = (typeof DELIVERY_OPERATION_RECOVERY_ACTIONS)[number];

import type { MessageKey } from "@/lib/i18n/messages";
import type {
  AutomationActionType,
  AutomationTriggerType,
} from "@/lib/types/automation";

export const AUTOMATION_TRIGGER_LABEL_KEYS: Record<
  AutomationTriggerType,
  MessageKey
> = {
  error: "admin_automation_trigger_error",
  latency: "admin_automation_trigger_latency",
  usage: "admin_automation_trigger_usage",
};

export const AUTOMATION_ACTION_LABEL_KEYS: Record<
  AutomationActionType,
  MessageKey
> = {
  alert: "admin_automation_action_alert",
  rollback: "admin_automation_action_rollback",
  disable_feature: "admin_automation_action_disable_feature",
};

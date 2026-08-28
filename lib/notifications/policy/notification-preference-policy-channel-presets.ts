import type { NotificationChannelPolicy } from "@/lib/notifications/policy/notification-preference-policy-types";

/** P2-A1 MANDATORY — in-app/badge/push always; sound/vibration user-configurable; DND bypass push only. */
export function mandatoryChannelPolicy(): NotificationChannelPolicy {
  return {
    inApp: "always",
    badge: "always",
    push: "always",
    sound: "user_configurable",
    vibration: "user_configurable",
    dnd: "bypass_push_only",
  };
}

/** P2-A1 OPTIONAL / SOCIAL default — delivery channels user-configurable; DND obey. */
export function optionalOperationalChannelPolicy(): NotificationChannelPolicy {
  return {
    inApp: "always",
    badge: "always",
    push: "user_configurable",
    sound: "user_configurable",
    vibration: "user_configurable",
    dnd: "obey",
  };
}

/** Marketing class — same channel shape as optional; strict opt-in enforced at resolver layer later. */
export function marketingChannelPolicy(): NotificationChannelPolicy {
  return optionalOperationalChannelPolicy();
}

/** Social activity — same delivery channel semantics as optional operational. */
export function socialChannelPolicy(): NotificationChannelPolicy {
  return optionalOperationalChannelPolicy();
}

/** Call establishment / n/a policy class — outside normal preference delivery. */
export function callAuthorityChannelPolicy(): NotificationChannelPolicy {
  return {
    inApp: "na",
    badge: "na",
    push: "na",
    sound: "na",
    vibration: "na",
    dnd: "na",
  };
}

/**
 * P2-A3 — Effective notification preference resolver (pure).
 *
 * CLASSIFICATION: P2-A2 registry (`getNotificationPreferencePolicy`)
 * DECISION: this module (`resolveEffectiveNotificationPreference`)
 *
 * Runtime consumers are NOT cut over in P2-A3.
 */

import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import {
  getNotificationPreferencePolicy,
  isMandatoryPreferencePolicy,
} from "@/lib/notifications/policy/notification-preference-policy-registry";
import type {
  NormalizedAdminOpsPreferenceSnapshot,
  NormalizedMemberPreferenceSnapshot,
  NormalizedNotificationPreferenceSnapshot,
  NormalizedOwnerPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import type {
  NotificationPolicyClass,
  NotificationPreferenceDomain,
  NotificationPreferenceRecipientRole,
} from "@/lib/notifications/policy/notification-preference-policy-types";

export type EffectiveNotificationPreferenceReason =
  | "mandatory_push_override"
  | "master_push_disabled"
  | "domain_disabled"
  | "marketing_opt_out"
  | "quiet_hours"
  | "sound_disabled"
  | "domain_sound_disabled"
  | "owner_optional_default_enabled"
  | "owner_optional_disabled"
  | "admin_ops_default_enabled"
  | "admin_ops_sound_disabled"
  | "allowed"
  | "policy_suppressed"
  | "call_authority_na"
  | "safe_fallback";

export type EffectiveNotificationPreference = Readonly<{
  showInApp: boolean;
  showBadge: boolean;
  playSound: boolean;
  sendPush: boolean;
  vibrate: boolean;
  quietSuppressed: boolean;
  mandatory: boolean;
  reason: EffectiveNotificationPreferenceReason;
  preferenceDomain: NotificationPreferenceDomain;
  policyClass: NotificationPolicyClass;
  recipientRole: NotificationPreferenceRecipientRole;
}>;

export type ResolveEffectiveNotificationPreferenceInput = Readonly<{
  eventType?: NotificationEventType | string | null;
  metaKind?: string | null;
  recipientRole: NotificationPreferenceRecipientRole;
  recipientScope?: Readonly<{
    storeId?: string | null;
  }>;
  pushKind?: string | null;
  surface?: "in_app" | "push" | "native" | "admin_ops" | string;
  preferences: NormalizedNotificationPreferenceSnapshot;
  now?: Date;
}>;

type DomainGateResult = Readonly<{
  pushAllowed: boolean;
  soundAllowed: boolean;
  pushReason: EffectiveNotificationPreferenceReason;
  soundReason: EffectiveNotificationPreferenceReason;
}>;

function quietActiveForRole(
  role: NotificationPreferenceRecipientRole,
  preferences: NormalizedNotificationPreferenceSnapshot
): boolean {
  if (role === "admin_ops") return false;
  if (role === "owner") {
    const q = preferences.owner?.quiet;
    return q?.enabled === true && q.activeNow === true;
  }
  const q = preferences.member?.quiet;
  return q?.enabled === true && q.activeNow === true;
}

function memberMasterPushEnabled(member: NormalizedMemberPreferenceSnapshot | undefined): boolean {
  if (!member) return true;
  return member.pushEnabled !== false && member.serviceEnabled !== false;
}

function ownerOptionalPushEnabled(owner: NormalizedOwnerPreferenceSnapshot | undefined): boolean {
  if (owner?.optionalPushEnabled === undefined) return true;
  return owner.optionalPushEnabled !== false;
}

function ownerOptionalSoundEnabled(owner: NormalizedOwnerPreferenceSnapshot | undefined): boolean {
  if (owner?.optionalSoundEnabled === undefined) return true;
  return owner.optionalSoundEnabled !== false;
}

function adminOpsSoundEnabled(admin: NormalizedAdminOpsPreferenceSnapshot | undefined): boolean {
  if (admin?.soundEnabled === undefined) return true;
  return admin.soundEnabled !== false;
}

function isFinancialMandatoryDomain(domain: NotificationPreferenceDomain): boolean {
  return domain === "member_financial" || domain === "owner_financial";
}

function isOwnerScopedDomain(domain: NotificationPreferenceDomain): boolean {
  return domain === "owner_financial" || domain === "owner_order_ops";
}

function memberDomainPushEnabled(
  domain: NotificationPreferenceDomain,
  member: NormalizedMemberPreferenceSnapshot
): boolean {
  switch (domain) {
    case "trade_chat":
      return member.tradeChatEnabled !== false && member.chatPushEnabled !== false;
    case "community_chat":
      return member.communityChatEnabled !== false && member.chatPushEnabled !== false;
    case "order_chat":
      return member.orderEnabled !== false;
    case "order":
      return member.orderEnabled !== false;
    case "trade_events":
      return member.tradeEventsEnabled !== false;
    case "community_social":
      return member.communitySocialEnabled !== false;
    case "notice":
    case "system_test":
      return member.noticeEnabled !== false;
    case "marketing":
      return member.marketingEnabled === true && member.marketingPushEnabled === true;
    case "call":
      return true;
    default:
      return true;
  }
}

function memberDomainSoundEnabled(
  domain: NotificationPreferenceDomain,
  member: NormalizedMemberPreferenceSnapshot
): boolean {
  switch (domain) {
    case "trade_chat":
      return member.tradeChatEnabled !== false;
    case "community_chat":
      return member.communityChatEnabled !== false;
    case "order_chat":
      return member.orderEnabled !== false;
    case "order":
      return member.orderEnabled !== false;
    case "trade_events":
      return member.tradeEventsEnabled !== false;
    case "community_social":
      return member.communitySocialEnabled !== false;
    case "notice":
    case "system_test":
      return member.noticeEnabled !== false;
    case "marketing":
      return member.marketingEnabled !== false;
    case "call":
      return true;
    default:
      return true;
  }
}

function resolveDomainDeliveryGate(
  domain: NotificationPreferenceDomain,
  policyClass: NotificationPolicyClass,
  recipientRole: NotificationPreferenceRecipientRole,
  preferences: NormalizedNotificationPreferenceSnapshot
): DomainGateResult {
  const mandatory = policyClass === "mandatory";

  if (recipientRole === "admin_ops" || domain === "admin_ops_sound") {
    const soundOk = adminOpsSoundEnabled(preferences.adminOps);
    return {
      pushAllowed: false,
      soundAllowed: soundOk,
      pushReason: "policy_suppressed",
      soundReason: soundOk ? "admin_ops_default_enabled" : "admin_ops_sound_disabled",
    };
  }

  if (policyClass === "n_a") {
    return {
      pushAllowed: false,
      soundAllowed: false,
      pushReason: "call_authority_na",
      soundReason: "call_authority_na",
    };
  }

  if (mandatory || isFinancialMandatoryDomain(domain)) {
    return {
      pushAllowed: true,
      soundAllowed: true,
      pushReason: "mandatory_push_override",
      soundReason: "allowed",
    };
  }

  if (recipientRole === "owner" || isOwnerScopedDomain(domain)) {
    const pushOk = ownerOptionalPushEnabled(preferences.owner);
    const soundOk = ownerOptionalSoundEnabled(preferences.owner);
    return {
      pushAllowed: pushOk,
      soundAllowed: soundOk,
      pushReason: pushOk ? "owner_optional_default_enabled" : "owner_optional_disabled",
      soundReason: soundOk ? "owner_optional_default_enabled" : "owner_optional_disabled",
    };
  }

  const member = preferences.member;
  if (!member) {
    return {
      pushAllowed: true,
      soundAllowed: true,
      pushReason: "allowed",
      soundReason: "allowed",
    };
  }

  if (!memberMasterPushEnabled(member)) {
    return {
      pushAllowed: false,
      soundAllowed: memberDomainSoundEnabled(domain, member),
      pushReason: "master_push_disabled",
      soundReason: member.soundEnabled !== false ? "allowed" : "sound_disabled",
    };
  }

  const pushDomainOk = memberDomainPushEnabled(domain, member);
  const soundDomainOk = memberDomainSoundEnabled(domain, member);

  if (policyClass === "marketing" || domain === "marketing") {
    const marketingOk =
      member.marketingEnabled === true && member.marketingPushEnabled === true;
    return {
      pushAllowed: marketingOk,
      soundAllowed: member.marketingEnabled !== false,
      pushReason: marketingOk ? "allowed" : "marketing_opt_out",
      soundReason: member.marketingEnabled !== false ? "allowed" : "marketing_opt_out",
    };
  }

  return {
    pushAllowed: pushDomainOk,
    soundAllowed: soundDomainOk,
    pushReason: pushDomainOk ? "allowed" : "domain_disabled",
    soundReason: soundDomainOk ? "allowed" : "domain_sound_disabled",
  };
}

function resolveVibrate(
  domain: NotificationPreferenceDomain,
  recipientRole: NotificationPreferenceRecipientRole,
  preferences: NormalizedNotificationPreferenceSnapshot,
  playSound: boolean
): boolean {
  if (!playSound) return false;
  if (recipientRole === "owner") {
    return preferences.owner?.vibrationEnabled !== false;
  }
  if (recipientRole === "admin_ops") {
    return false;
  }
  return preferences.member?.vibrationEnabled !== false;
}

function applyQuietToPush(
  mandatory: boolean,
  quietActive: boolean,
  pushAllowed: boolean
): boolean {
  if (!pushAllowed) return false;
  if (!quietActive) return true;
  if (mandatory) return true;
  return false;
}

function applyQuietToSound(quietActive: boolean, soundAllowed: boolean): boolean {
  if (!soundAllowed) return false;
  if (!quietActive) return true;
  return false;
}

/**
 * Pure effective preference resolver — no IO, no globals.
 */
export function resolveEffectiveNotificationPreference(
  input: ResolveEffectiveNotificationPreferenceInput
): EffectiveNotificationPreference {
  if (input.recipientRole === "admin_ops") {
    const soundOk = adminOpsSoundEnabled(input.preferences.adminOps);
    return {
      showInApp: false,
      showBadge: false,
      sendPush: false,
      playSound: soundOk,
      vibrate: false,
      quietSuppressed: false,
      mandatory: false,
      reason: soundOk ? "admin_ops_default_enabled" : "admin_ops_sound_disabled",
      preferenceDomain: "admin_ops_sound",
      policyClass: "optional_operational",
      recipientRole: "admin_ops",
    };
  }

  const policy = getNotificationPreferencePolicy({
    eventType: input.eventType,
    metaKind: input.metaKind,
    recipientRole: input.recipientRole,
  });

  const mandatory = isMandatoryPreferencePolicy(policy);
  const quietActive = quietActiveForRole(policy.recipientRole, input.preferences);
  const domainGate = resolveDomainDeliveryGate(
    policy.preferenceDomain,
    policy.policyClass,
    policy.recipientRole,
    input.preferences
  );

  const showInApp = policy.policyClass !== "n_a";
  const showBadge = policy.policyClass !== "n_a";

  const sendPush = applyQuietToPush(mandatory, quietActive, domainGate.pushAllowed);
  let playSound = domainGate.soundAllowed;

  if (policy.recipientRole === "member" && input.preferences.member) {
    if (input.preferences.member.soundEnabled === false) {
      playSound = false;
    }
  }

  // mandatory delivery ≠ forced sound — Owner optional_sound_enabled=false always mutes.
  if (policy.recipientRole === "owner" && input.preferences.owner?.optionalSoundEnabled === false) {
    playSound = false;
  }

  playSound = applyQuietToSound(quietActive, playSound);

  const vibrate = resolveVibrate(
    policy.preferenceDomain,
    policy.recipientRole,
    input.preferences,
    playSound
  );

  const quietSuppressed =
    quietActive &&
    (mandatory ? playSound === false : sendPush === false || playSound === false);

  let reason: EffectiveNotificationPreferenceReason = "allowed";
  if (policy.policyClass === "n_a") {
    reason = "call_authority_na";
  } else if (mandatory && sendPush) {
    reason = "mandatory_push_override";
  } else if (quietActive && !mandatory && !sendPush) {
    reason = "quiet_hours";
  } else if (quietActive && mandatory && !playSound) {
    reason = "quiet_hours";
  } else if (!sendPush) {
    reason = domainGate.pushReason;
  } else if (!playSound) {
    reason = domainGate.soundReason;
  } else if (domainGate.pushReason !== "allowed" || domainGate.soundReason !== "allowed") {
    reason =
      domainGate.pushReason !== "allowed" ? domainGate.pushReason : domainGate.soundReason;
  } else if (policy.resolutionSource === "safe_fallback") {
    reason = "safe_fallback";
  }

  return {
    showInApp,
    showBadge,
    playSound,
    sendPush,
    vibrate,
    quietSuppressed,
    mandatory,
    reason,
    preferenceDomain: policy.preferenceDomain,
    policyClass: policy.policyClass,
    recipientRole: policy.recipientRole,
  };
}

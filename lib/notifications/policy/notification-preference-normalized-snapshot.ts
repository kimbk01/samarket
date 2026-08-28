/**
 * P2-A3 — Normalized preference input for effective resolver (pure input contract).
 *
 * Adapters at storage/read cutover map DB rows → this shape.
 * The resolver MUST NOT query Supabase or read raw settings tables.
 */

export type NormalizedQuietPreference = Readonly<{
  enabled: boolean;
  activeNow: boolean;
}>;

export type NormalizedMemberPreferenceSnapshot = Readonly<{
  pushEnabled: boolean;
  serviceEnabled: boolean;
  chatPushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  tradeChatEnabled: boolean;
  communityChatEnabled: boolean;
  orderEnabled: boolean;
  /** Legacy read-compat only — not used for owner financial semantics. */
  storeEnabled: boolean;
  tradeEventsEnabled: boolean;
  communitySocialEnabled: boolean;
  noticeEnabled: boolean;
  marketingEnabled: boolean;
  marketingPushEnabled: boolean;
  quiet: NormalizedQuietPreference;
}>;

export type NormalizedOwnerPreferenceSnapshot = Readonly<{
  optionalPushEnabled?: boolean;
  optionalSoundEnabled?: boolean;
  vibrationEnabled?: boolean;
  quiet?: NormalizedQuietPreference;
}>;

export type NormalizedAdminOpsPreferenceSnapshot = Readonly<{
  soundEnabled?: boolean;
}>;

export type NormalizedNotificationPreferenceSnapshot = Readonly<{
  member?: NormalizedMemberPreferenceSnapshot;
  owner?: NormalizedOwnerPreferenceSnapshot;
  adminOps?: NormalizedAdminOpsPreferenceSnapshot;
}>;

/** Optimistic defaults — preserve current runtime until owner/admin storage cutover. */
export const DEFAULT_NORMALIZED_MEMBER_PREFERENCES: NormalizedMemberPreferenceSnapshot = {
  pushEnabled: true,
  serviceEnabled: true,
  chatPushEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  tradeChatEnabled: true,
  communityChatEnabled: true,
  orderEnabled: true,
  storeEnabled: true,
  tradeEventsEnabled: true,
  communitySocialEnabled: true,
  noticeEnabled: true,
  marketingEnabled: true,
  marketingPushEnabled: false,
  quiet: { enabled: false, activeNow: false },
};

export const DEFAULT_NORMALIZED_OWNER_PREFERENCES: NormalizedOwnerPreferenceSnapshot = {
  optionalPushEnabled: undefined,
  optionalSoundEnabled: undefined,
  vibrationEnabled: true,
  quiet: { enabled: false, activeNow: false },
};

export const DEFAULT_NORMALIZED_ADMIN_OPS_PREFERENCES: NormalizedAdminOpsPreferenceSnapshot = {
  soundEnabled: undefined,
};

export function defaultNormalizedNotificationPreferences(): NormalizedNotificationPreferenceSnapshot {
  return {
    member: DEFAULT_NORMALIZED_MEMBER_PREFERENCES,
    owner: DEFAULT_NORMALIZED_OWNER_PREFERENCES,
    adminOps: DEFAULT_NORMALIZED_ADMIN_OPS_PREFERENCES,
  };
}

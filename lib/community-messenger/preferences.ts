"use client";

const STORAGE_PREFIX = "samarket:communityMessenger:";
export const COMMUNITY_MESSENGER_PREFERENCE_EVENT = "samarket:communityMessenger:preferencesChanged";

type PreferenceKey =
  | "incomingCallSound"
  | "incomingCallBanner"
  | "phoneFriendAdd"
  | "contactAutoAdd"
  | "groupJoinPreview"
  | "mediaAutoSave"
  | "linkPreview";

export type CommunityMessengerLocalSettings = {
  phoneFriendAddEnabled: boolean;
  contactAutoAddEnabled: boolean;
  groupJoinPreviewEnabled: boolean;
  mediaAutoSaveEnabled: boolean;
  linkPreviewEnabled: boolean;
};

const LOCAL_SETTINGS_DEFAULTS: CommunityMessengerLocalSettings = {
  phoneFriendAddEnabled: true,
  contactAutoAddEnabled: false,
  groupJoinPreviewEnabled: true,
  mediaAutoSaveEnabled: false,
  linkPreviewEnabled: true,
};

function storageKey(key: PreferenceKey): string {
  return `${STORAGE_PREFIX}${key}`;
}

function readBool(key: PreferenceKey, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (raw == null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: PreferenceKey, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(key), value ? "1" : "0");
    window.dispatchEvent(new CustomEvent(COMMUNITY_MESSENGER_PREFERENCE_EVENT));
  } catch {
    /* ignore */
  }
}

export function isCommunityMessengerIncomingCallSoundEnabled(): boolean {
  return readBool("incomingCallSound", true);
}

export function setCommunityMessengerIncomingCallSoundEnabled(enabled: boolean): void {
  writeBool("incomingCallSound", enabled);
}

export function isCommunityMessengerIncomingCallBannerEnabled(): boolean {
  return readBool("incomingCallBanner", true);
}

export function setCommunityMessengerIncomingCallBannerEnabled(enabled: boolean): void {
  writeBool("incomingCallBanner", enabled);
}

export function readCommunityMessengerLocalSettings(): CommunityMessengerLocalSettings {
  return {
    phoneFriendAddEnabled: readBool("phoneFriendAdd", LOCAL_SETTINGS_DEFAULTS.phoneFriendAddEnabled),
    contactAutoAddEnabled: readBool("contactAutoAdd", LOCAL_SETTINGS_DEFAULTS.contactAutoAddEnabled),
    groupJoinPreviewEnabled: readBool("groupJoinPreview", LOCAL_SETTINGS_DEFAULTS.groupJoinPreviewEnabled),
    mediaAutoSaveEnabled: readBool("mediaAutoSave", LOCAL_SETTINGS_DEFAULTS.mediaAutoSaveEnabled),
    linkPreviewEnabled: readBool("linkPreview", LOCAL_SETTINGS_DEFAULTS.linkPreviewEnabled),
  };
}

export function writeCommunityMessengerLocalSetting(
  key: keyof CommunityMessengerLocalSettings,
  enabled: boolean
): void {
  const mappedKey: Record<keyof CommunityMessengerLocalSettings, PreferenceKey> = {
    phoneFriendAddEnabled: "phoneFriendAdd",
    contactAutoAddEnabled: "contactAutoAdd",
    groupJoinPreviewEnabled: "groupJoinPreview",
    mediaAutoSaveEnabled: "mediaAutoSave",
    linkPreviewEnabled: "linkPreview",
  };
  writeBool(mappedKey[key], enabled);
}

export function writeCommunityMessengerLocalSettings(
  patch: Partial<CommunityMessengerLocalSettings>
): CommunityMessengerLocalSettings {
  const next = { ...readCommunityMessengerLocalSettings(), ...patch };
  writeCommunityMessengerLocalSetting("phoneFriendAddEnabled", next.phoneFriendAddEnabled);
  writeCommunityMessengerLocalSetting("contactAutoAddEnabled", next.contactAutoAddEnabled);
  writeCommunityMessengerLocalSetting("groupJoinPreviewEnabled", next.groupJoinPreviewEnabled);
  writeCommunityMessengerLocalSetting("mediaAutoSaveEnabled", next.mediaAutoSaveEnabled);
  writeCommunityMessengerLocalSetting("linkPreviewEnabled", next.linkPreviewEnabled);
  return next;
}

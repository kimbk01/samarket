"use client";

const STORAGE_PREFIX = "samarket:communityMessenger:";
export const COMMUNITY_MESSENGER_PREFERENCE_EVENT = "samarket:communityMessenger:preferencesChanged";

type PreferenceKey = "incomingCallSound" | "incomingCallBanner";

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

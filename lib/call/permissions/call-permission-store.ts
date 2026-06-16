import type { CallPermissionStoreState } from "@/lib/call/permissions/call-permission-types";

const STORAGE_KEY = "dibay_call_permission_store_v1";
const ONBOARDING_SHOWN_KEY = "dibay_call_permission_onboarding_shown_v1";

type PersistedCallPermissionStore = {
  state: CallPermissionStoreState;
  updatedAt: number;
};

let memoryStoreState: CallPermissionStoreState = "unknown";
let memoryOnboardingShown = false;

function readPersisted(): PersistedCallPermissionStore {
  if (typeof localStorage === "undefined") {
    return { state: memoryStoreState, updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: "unknown", updatedAt: 0 };
    const parsed = JSON.parse(raw) as PersistedCallPermissionStore;
    const state = parsed.state ?? "unknown";
    return {
      state: isValidStoreState(state) ? state : "unknown",
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return { state: "unknown", updatedAt: 0 };
  }
}

function isValidStoreState(value: string): value is CallPermissionStoreState {
  return (
    value === "unknown" ||
    value === "granted_audio" ||
    value === "granted_audio_video" ||
    value === "denied_once" ||
    value === "denied_permanently" ||
    value === "system_revoked"
  );
}

function writePersisted(state: CallPermissionStoreState): void {
  memoryStoreState = state;
  if (typeof localStorage === "undefined") return;
  try {
    const payload: PersistedCallPermissionStore = { state, updatedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readCallPermissionStoreState(): CallPermissionStoreState {
  return readPersisted().state;
}

export function writeCallPermissionStoreState(state: CallPermissionStoreState): void {
  writePersisted(state);
}

export function markCallPermissionOnboardingShown(): void {
  memoryOnboardingShown = true;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_SHOWN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function hasCallPermissionOnboardingBeenShown(): boolean {
  if (typeof localStorage === "undefined") return memoryOnboardingShown;
  try {
    return localStorage.getItem(ONBOARDING_SHOWN_KEY) != null;
  } catch {
    return false;
  }
}

export function deriveStoreStateFromOsGrant(input: {
  microphoneGranted: boolean;
  cameraGranted: boolean;
  deniedPermanently: boolean;
}): CallPermissionStoreState {
  if (input.deniedPermanently) return "denied_permanently";
  if (input.microphoneGranted && input.cameraGranted) return "granted_audio_video";
  if (input.microphoneGranted) return "granted_audio";
  return "denied_once";
}

/** @internal tests */
export function resetCallPermissionStoreForTests(): void {
  memoryStoreState = "unknown";
  memoryOnboardingShown = false;
}

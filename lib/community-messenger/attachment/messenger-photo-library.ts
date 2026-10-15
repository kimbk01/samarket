"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

export const MESSENGER_PHOTO_LIBRARY_PLUGIN_ID = "MessengerPhotoLibrary";

export type MessengerPhotoLibraryPermissionState =
  | "authorized"
  | "limited"
  | "denied"
  | "prompt"
  | "unavailable";

export type MessengerPhotoLibraryRecentPhoto = {
  id: string;
  thumbnailDataUrl: string;
  width?: number;
  height?: number;
};

export type MessengerPhotoLibraryPayload = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  base64: string;
};

/**
 * Additive native field (newer binaries only): rows that could not be decoded/encoded.
 * `index` = position in the picker selection (pickPhotos) or in `ids` (resolvePhotos).
 * Old binaries omit `failed` entirely → treated as [].
 */
export type MessengerPhotoLibraryFailure = {
  index: number;
  id?: string;
  reason: string;
};

export type MessengerPhotoLibraryResult = {
  photos: MessengerPhotoLibraryPayload[];
  failed: MessengerPhotoLibraryFailure[];
};

export type MessengerPhotoLibraryPlugin = {
  getPermissionState(): Promise<{ state: MessengerPhotoLibraryPermissionState }>;
  requestPermission(): Promise<{ state: MessengerPhotoLibraryPermissionState }>;
  getRecentPhotos(options: { limit: number }): Promise<{
    photos: MessengerPhotoLibraryRecentPhoto[];
    state?: MessengerPhotoLibraryPermissionState;
  }>;
  pickPhotos(options: { max: number }): Promise<{
    photos: MessengerPhotoLibraryPayload[];
    failed?: MessengerPhotoLibraryFailure[];
    cancelled?: boolean;
  }>;
  resolvePhotos(options: { ids: string[] }): Promise<{
    photos: MessengerPhotoLibraryPayload[];
    failed?: MessengerPhotoLibraryFailure[];
  }>;
};

const MessengerPhotoLibrary = registerPlugin<MessengerPhotoLibraryPlugin>(
  MESSENGER_PHOTO_LIBRARY_PLUGIN_ID,
);

type MessengerPhotoLibraryMethod = keyof MessengerPhotoLibraryPlugin;

function invokeMessengerPhotoLibraryPlugin<T>(
  method: MessengerPhotoLibraryMethod,
  options?: Record<string, unknown>,
): Promise<T> {
  const cap = (typeof window !== "undefined" ? window : undefined) as
    | (Window & {
        Capacitor?: {
          nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown>;
        };
      })
    | undefined;
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(MESSENGER_PHOTO_LIBRARY_PLUGIN_ID, method, options ?? {}) as Promise<T>;
  }
  if (method === "getPermissionState") {
    return MessengerPhotoLibrary.getPermissionState() as Promise<T>;
  }
  if (method === "requestPermission") {
    return MessengerPhotoLibrary.requestPermission() as Promise<T>;
  }
  if (method === "getRecentPhotos") {
    return MessengerPhotoLibrary.getRecentPhotos({ limit: Number(options?.limit ?? 24) }) as Promise<T>;
  }
  if (method === "pickPhotos") {
    return MessengerPhotoLibrary.pickPhotos({ max: Number(options?.max ?? 10) }) as Promise<T>;
  }
  if (method === "resolvePhotos") {
    const ids = Array.isArray(options?.ids) ? options.ids.filter((id): id is string => typeof id === "string") : [];
    return MessengerPhotoLibrary.resolvePhotos({ ids }) as Promise<T>;
  }
  throw new Error("Messenger photo library bridge unavailable");
}

async function ensureMessengerPhotoLibraryBridgeReady(): Promise<boolean> {
  if (!isCapacitorNativePlatform()) return false;
  if (isCapacitorBridgeReady()) return true;
  return waitForCapacitorBridgeReady({ timeoutMs: 3_500 });
}

export async function getPermissionState(): Promise<MessengerPhotoLibraryPermissionState> {
  if (!(await ensureMessengerPhotoLibraryBridgeReady())) return "unavailable";
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{ state?: MessengerPhotoLibraryPermissionState }>(
      "getPermissionState",
    );
    return result.state ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function requestPermission(): Promise<MessengerPhotoLibraryPermissionState> {
  if (!(await ensureMessengerPhotoLibraryBridgeReady())) return "unavailable";
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{ state?: MessengerPhotoLibraryPermissionState }>(
      "requestPermission",
    );
    return result.state ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function getRecentPhotos(limit: number): Promise<{
  photos: MessengerPhotoLibraryRecentPhoto[];
  state: MessengerPhotoLibraryPermissionState;
}> {
  if (!(await ensureMessengerPhotoLibraryBridgeReady())) return { photos: [], state: "unavailable" };
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{
      photos?: MessengerPhotoLibraryRecentPhoto[];
      state?: MessengerPhotoLibraryPermissionState;
    }>("getRecentPhotos", { limit });
    return {
      photos: Array.isArray(result.photos) ? result.photos : [],
      state: result.state ?? "authorized",
    };
  } catch {
    return { photos: [], state: "unavailable" };
  }
}

/** Normalizes the optional native `failed` array (absent on old binaries, defensive against bad rows). */
export function normalizeMessengerPhotoLibraryFailures(raw: unknown): MessengerPhotoLibraryFailure[] {
  if (!Array.isArray(raw)) return [];
  const out: MessengerPhotoLibraryFailure[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as { index?: unknown; id?: unknown; reason?: unknown };
    const index = typeof r.index === "number" && Number.isFinite(r.index) ? r.index : -1;
    const reason = typeof r.reason === "string" && r.reason.trim() ? r.reason : "unknown";
    out.push(typeof r.id === "string" ? { index, id: r.id, reason } : { index, reason });
  }
  return out;
}

const EMPTY_RESULT = (): MessengerPhotoLibraryResult => ({ photos: [], failed: [] });

export async function pickPhotos(max: number): Promise<MessengerPhotoLibraryResult> {
  if (!(await ensureMessengerPhotoLibraryBridgeReady())) return EMPTY_RESULT();
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{
      photos?: MessengerPhotoLibraryPayload[];
      failed?: unknown;
      cancelled?: boolean;
    }>("pickPhotos", { max });
    const failed = normalizeMessengerPhotoLibraryFailures(result.failed);
    const photos = Array.isArray(result.photos) ? result.photos : [];
    if (result.cancelled && failed.length === 0) return EMPTY_RESULT();
    return { photos, failed };
  } catch {
    return EMPTY_RESULT();
  }
}

export async function resolvePhotos(ids: string[]): Promise<MessengerPhotoLibraryResult> {
  if (ids.length === 0 || !(await ensureMessengerPhotoLibraryBridgeReady())) return EMPTY_RESULT();
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{
      photos?: MessengerPhotoLibraryPayload[];
      failed?: unknown;
    }>("resolvePhotos", { ids });
    return {
      photos: Array.isArray(result.photos) ? result.photos : [],
      failed: normalizeMessengerPhotoLibraryFailures(result.failed),
    };
  } catch {
    return EMPTY_RESULT();
  }
}

export function messengerPhotoPayloadToFile(
  payload: MessengerPhotoLibraryPayload,
  index = 0,
): File {
  const mimeType = payload.mimeType?.trim() || "image/jpeg";
  const fileName = payload.fileName?.trim() || `messenger-photo-${Date.now()}-${index}.jpg`;
  const binary = window.atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

/**
 * Native plugin header present in this binary? Old binaries without MessengerPhotoLibrary must fall back
 * to the web `<input type="file">` path instead of rendering a dead native photo button.
 */
function isMessengerPhotoLibraryPluginRegistered(): boolean {
  try {
    if (typeof Capacitor?.isPluginAvailable !== "function") return true;
    return Capacitor.isPluginAvailable(MESSENGER_PHOTO_LIBRARY_PLUGIN_ID);
  } catch {
    return false;
  }
}

export function isMessengerPhotoLibraryNativeAvailable(): boolean {
  return isCapacitorNativePlatform() && isCapacitorBridgeReady() && isMessengerPhotoLibraryPluginRegistered();
}

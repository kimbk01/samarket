"use client";

import { registerPlugin } from "@capacitor/core";
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

export type MessengerPhotoLibraryPlugin = {
  getPermissionState(): Promise<{ state: MessengerPhotoLibraryPermissionState }>;
  requestPermission(): Promise<{ state: MessengerPhotoLibraryPermissionState }>;
  getRecentPhotos(options: { limit: number }): Promise<{
    photos: MessengerPhotoLibraryRecentPhoto[];
    state?: MessengerPhotoLibraryPermissionState;
  }>;
  pickPhotos(options: { max: number }): Promise<{
    photos: MessengerPhotoLibraryPayload[];
    cancelled?: boolean;
  }>;
  resolvePhotos(options: { ids: string[] }): Promise<{ photos: MessengerPhotoLibraryPayload[] }>;
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

export async function pickPhotos(max: number): Promise<MessengerPhotoLibraryPayload[]> {
  if (!(await ensureMessengerPhotoLibraryBridgeReady())) return [];
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{
      photos?: MessengerPhotoLibraryPayload[];
      cancelled?: boolean;
    }>("pickPhotos", { max });
    if (result.cancelled) return [];
    return Array.isArray(result.photos) ? result.photos : [];
  } catch {
    return [];
  }
}

export async function resolvePhotos(ids: string[]): Promise<MessengerPhotoLibraryPayload[]> {
  if (ids.length === 0 || !(await ensureMessengerPhotoLibraryBridgeReady())) return [];
  try {
    const result = await invokeMessengerPhotoLibraryPlugin<{ photos?: MessengerPhotoLibraryPayload[] }>(
      "resolvePhotos",
      { ids },
    );
    return Array.isArray(result.photos) ? result.photos : [];
  } catch {
    return [];
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

export function isMessengerPhotoLibraryNativeAvailable(): boolean {
  return isCapacitorNativePlatform() && isCapacitorBridgeReady();
}

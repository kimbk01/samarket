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
  /** 신규 바이너리 전용 — 구버전은 메서드 없음(raw nativePromise 는 reject 없이 pending → 헤더로 선판정) */
  getSaveCapabilities(): Promise<{ saveImages?: boolean; version?: number }>;
  saveImages(options: { urls: string[] }): Promise<{
    saved?: number[];
    failed?: MessengerPhotoLibraryFailure[];
    permission?: string;
  }>;
};

const MessengerPhotoLibrary = registerPlugin<MessengerPhotoLibraryPlugin>(
  MESSENGER_PHOTO_LIBRARY_PLUGIN_ID,
);

type MessengerPhotoLibraryMethod = keyof MessengerPhotoLibraryPlugin;

type CapacitorWindowLike = Window & {
  Capacitor?: {
    nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown>;
    PluginHeaders?: ReadonlyArray<{ name?: unknown; methods?: ReadonlyArray<{ name?: unknown }> | unknown }>;
  };
};

function readCapacitorWindow(): CapacitorWindowLike | undefined {
  return (typeof window !== "undefined" ? window : undefined) as CapacitorWindowLike | undefined;
}

/**
 * 바이너리에 실린 플러그인 헤더(`window.Capacitor.PluginHeaders`)로 메서드 존재를 **동기** 판정.
 * iOS(JSExport.swift: WKUserScript atDocumentStart)·Android(JSExport.java: 브리지 JS)가
 * `{ name, methods: [{ name, rtype }] }` 를 주입한다.
 *
 * Capacitor 8 은 헤더에 없는 메서드를 raw `nativePromise` 로 부르면 reject 하지 않는다
 * (iOS CapacitorBridge.swift "No method found" 로그 후 return, Android InvalidPluginMethodException 로그)
 * → 프라미스가 영원히 pending. 그래서 헤더로 먼저 거른다.
 *
 * @returns true/false = 헤더로 확정, null = 헤더 없음(브리지 미준비 등 — 판정 보류)
 */
export function messengerPhotoLibraryHeaderHasMethod(method: string): boolean | null {
  const headers = readCapacitorWindow()?.Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return null;
  const header = headers.find((h) => h && typeof h === "object" && h.name === MESSENGER_PHOTO_LIBRARY_PLUGIN_ID);
  if (!header) return false;
  const methods = Array.isArray(header.methods) ? (header.methods as ReadonlyArray<{ name?: unknown }>) : [];
  return methods.some((m) => m && typeof m === "object" && m.name === method);
}

class MessengerPhotoLibraryTimeoutError extends Error {
  constructor(method: string) {
    super(`MessengerPhotoLibrary.${method} timed out`);
    this.name = "MessengerPhotoLibraryTimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, method: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MessengerPhotoLibraryTimeoutError(method)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function invokeMessengerPhotoLibraryPlugin<T>(
  method: MessengerPhotoLibraryMethod,
  options?: Record<string, unknown>,
): Promise<T> {
  /** 헤더가 "메서드 없음"을 확정하면 즉시 reject — raw nativePromise 는 미지원 메서드에서 영원히 pending. */
  if (messengerPhotoLibraryHeaderHasMethod(method) === false) {
    return Promise.reject(new Error(`MessengerPhotoLibrary.${method} is not implemented in this binary`));
  }
  const nativePromise = readCapacitorWindow()?.Capacitor?.nativePromise;
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
  if (method === "getSaveCapabilities") {
    return MessengerPhotoLibrary.getSaveCapabilities() as Promise<T>;
  }
  if (method === "saveImages") {
    const urls = Array.isArray(options?.urls) ? options.urls.filter((u): u is string => typeof u === "string") : [];
    return MessengerPhotoLibrary.saveImages({ urls }) as Promise<T>;
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

/** 사진첩 저장 결과 — index 는 요청한 urls 순서. */
export type MessengerNativeImageSaveResult = {
  saved: number[];
  failed: MessengerPhotoLibraryFailure[];
  permission: "granted" | "denied" | "unknown";
};

/** getSaveCapabilities 2차 확인 상한 — 헤더가 없을 때만 쓰인다. */
export const MESSENGER_SAVE_CAPABILITIES_TIMEOUT_MS = 2_500;

/** 확정 결과만 캐시(헤더 판정·네이티브 응답·브리지 준비 후 타임아웃). 브리지 미준비 false 는 캐시하지 않는다. */
let nativeSaveSupportDecided: boolean | null = null;
let nativeSaveSupportProbe: Promise<boolean> | null = null;

/**
 * 이 앱 바이너리가 사진첩 저장(saveImages)을 지원하는가 — 항상 유한 시간 안에 결정된다.
 * 1) 플러그인 헤더에 `saveImages` 가 있으면 즉시 true, 플러그인/메서드가 없으면 즉시 false (동기).
 * 2) 헤더가 없으면(드묾) 브리지 준비 후 getSaveCapabilities 를 타임아웃 레이스로 확인.
 * 구버전 바이너리에서 무반응 저장 버튼을 만들지 않고, 자동 저장 큐도 막히지 않는다.
 */
export function probeMessengerNativeImageSaveSupport(): Promise<boolean> {
  if (nativeSaveSupportDecided !== null) return Promise.resolve(nativeSaveSupportDecided);
  if (nativeSaveSupportProbe) return nativeSaveSupportProbe;
  const decide = (v: boolean) => {
    nativeSaveSupportDecided = v;
    return v;
  };
  if (!isCapacitorNativePlatform()) return Promise.resolve(decide(false));
  const fromHeader = messengerPhotoLibraryHeaderHasMethod("saveImages");
  if (fromHeader !== null) return Promise.resolve(decide(fromHeader));
  const probe = (async (): Promise<boolean> => {
    if (!isMessengerPhotoLibraryPluginRegistered()) return decide(false);
    /** 브리지 미준비 → 이번 호출만 false, 캐시 안 함(다음 호출에서 재시도). */
    if (!(await ensureMessengerPhotoLibraryBridgeReady())) return false;
    const headerAfterReady = messengerPhotoLibraryHeaderHasMethod("saveImages");
    if (headerAfterReady !== null) return decide(headerAfterReady);
    try {
      const caps = await withTimeout(
        invokeMessengerPhotoLibraryPlugin<{ saveImages?: boolean }>("getSaveCapabilities"),
        MESSENGER_SAVE_CAPABILITIES_TIMEOUT_MS,
        "getSaveCapabilities",
      );
      return decide(caps?.saveImages === true);
    } catch {
      /** reject(UNIMPLEMENTED) 또는 브리지 준비 후 무응답(구버전 미지원 메서드) → 미지원 확정. */
      return decide(false);
    }
  })();
  nativeSaveSupportProbe = probe;
  void probe.finally(() => {
    if (nativeSaveSupportProbe === probe) nativeSaveSupportProbe = null;
  });
  return probe;
}

/** 테스트 전용 */
export function __resetMessengerNativeImageSaveProbeForTests(): void {
  nativeSaveSupportDecided = null;
  nativeSaveSupportProbe = null;
}

/** 저장 1회 상한 — 네이티브가 원본을 내려받으므로 장수에 비례(기본 20s + 장당 10s, 최대 120s). */
export function messengerNativeSaveImagesTimeoutMs(count: number): number {
  return Math.min(120_000, 20_000 + Math.max(0, count) * 10_000);
}

export async function saveImagesToNativePhotoLibrary(urls: string[]): Promise<MessengerNativeImageSaveResult> {
  const list = urls.map((u) => String(u ?? "").trim()).filter(Boolean);
  if (list.length === 0) return { saved: [], failed: [], permission: "unknown" };
  try {
    const result = await withTimeout(
      invokeMessengerPhotoLibraryPlugin<{
        saved?: unknown;
        failed?: unknown;
        permission?: unknown;
      }>("saveImages", { urls: list }),
      messengerNativeSaveImagesTimeoutMs(list.length),
      "saveImages",
    );
    const saved = Array.isArray(result.saved)
      ? result.saved.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      : [];
    const permission =
      result.permission === "granted" || result.permission === "denied" ? result.permission : "unknown";
    return { saved, failed: normalizeMessengerPhotoLibraryFailures(result.failed), permission };
  } catch (e) {
    const reason = e instanceof MessengerPhotoLibraryTimeoutError ? "timeout" : "bridge_failed";
    return {
      saved: [],
      failed: list.map((_, index) => ({ index, reason })),
      permission: "unknown",
    };
  }
}

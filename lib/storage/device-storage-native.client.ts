"use client";

import { registerPlugin } from "@capacitor/core";
import { estimateLocalRoomSnapshotsBytes } from "@/lib/community-messenger/local-store/roomSnapshotDb";
import {
  isClearableLocalStorageKey,
  isClearableSessionStorageKey,
} from "@/lib/mypage/client-cache-key-registry";

/**
 * 기기 저장공간 S2 (docs/audit/device-storage-legacy-design-2026-11-19.md §4 S2) — 웹 쪽 연결.
 * 네이티브 플러그인 `DibayDeviceStorage`(Android `DibayDeviceStoragePlugin.java` · iOS `DibayDeviceStoragePlugin.swift`)가
 * 있는 앱에서만 용량 표시·사진 캐시 삭제·카메라 임시 사진 삭제를 연다. 플러그인이 없는 구 바이너리·웹은 기존 화면 그대로.
 */
export const DIBAY_DEVICE_STORAGE_PLUGIN_ID = "DibayDeviceStorage";

export type NativeDeviceStorageUsage = {
  webCacheBytes: number;
  cameraTempBytes: number;
  platform?: string;
};

type Plugin = {
  getUsage(): Promise<NativeDeviceStorageUsage>;
  clearWebCache(): Promise<NativeDeviceStorageUsage>;
  clearCameraTemp(): Promise<NativeDeviceStorageUsage>;
};

const DibayDeviceStorage = registerPlugin<Plugin>(DIBAY_DEVICE_STORAGE_PLUGIN_ID);

export function hasNativeDeviceStoragePlugin(): boolean {
  if (typeof window === "undefined") return false;
  const headers = (window as unknown as { Capacitor?: { PluginHeaders?: Array<{ name?: string }> } }).Capacitor
    ?.PluginHeaders;
  return Array.isArray(headers) && headers.some((h) => h?.name === DIBAY_DEVICE_STORAGE_PLUGIN_ID);
}

function normalize(u: Partial<NativeDeviceStorageUsage> | null | undefined): NativeDeviceStorageUsage {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { webCacheBytes: n(u?.webCacheBytes), cameraTempBytes: n(u?.cameraTempBytes), platform: u?.platform };
}

export async function readNativeDeviceStorageUsage(): Promise<NativeDeviceStorageUsage | null> {
  if (!hasNativeDeviceStoragePlugin()) return null;
  try {
    return normalize(await DibayDeviceStorage.getUsage());
  } catch {
    return null;
  }
}

export async function clearNativeWebCache(): Promise<NativeDeviceStorageUsage | null> {
  if (!hasNativeDeviceStoragePlugin()) return null;
  try {
    return normalize(await DibayDeviceStorage.clearWebCache());
  } catch {
    return null;
  }
}

export async function clearNativeCameraTemp(): Promise<NativeDeviceStorageUsage | null> {
  if (!hasNativeDeviceStoragePlugin()) return null;
  try {
    return normalize(await DibayDeviceStorage.clearCameraTemp());
  } catch {
    return null;
  }
}

/** 목록 저장본 용량 — 지울 수 있게 등록된 키만(로그인·초안은 제외), UTF-16 근사 */
export function estimateClearableWebStorageBytes(): number {
  let chars = 0;
  const sum = (storage: Storage | undefined, match: (k: string) => boolean) => {
    if (!storage) return;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !match(k)) continue;
      chars += k.length + (storage.getItem(k)?.length ?? 0);
    }
  };
  try {
    sum(window.localStorage, isClearableLocalStorageKey);
  } catch {
    /* private mode */
  }
  try {
    sum(window.sessionStorage, isClearableSessionStorageKey);
  } catch {
    /* private mode */
  }
  return chars * 2;
}

export type DeviceStorageBreakdown = {
  native: NativeDeviceStorageUsage | null;
  chatRoomsBytes: number;
  listsBytes: number;
};

export async function readDeviceStorageBreakdown(): Promise<DeviceStorageBreakdown> {
  const [native, chatRoomsBytes] = await Promise.all([
    readNativeDeviceStorageUsage(),
    estimateLocalRoomSnapshotsBytes(),
  ]);
  return { native, chatRoomsBytes, listsBytes: estimateClearableWebStorageBytes() };
}

/** 사람이 읽는 크기 — 1,024 단위, KB 미만은 「0.1 MB 미만」 대신 KB 표시 */
export function formatStorageBytes(bytes: number): string {
  const b = Math.max(0, bytes);
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

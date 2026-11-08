"use client";

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import type { AppLanguageCode } from "@/lib/i18n/config";

/**
 * 언어 SSOT S8-6 — 이 기기에서 지금 쓰는 앱 언어(ko/en, 기기 언어 따름이면 그 결과값)를 서버에 기록한다.
 * 서버 알림 문구 언어 = 계정 명시값 → 최근 기기의 이 값 → en. 웹만 바뀌므로 구 앱도 동작한다.
 * - 서버가 이 기기 행을 실제로 바꾼 값(updated > 0)만 기억해 다시 보내지 않는다.
 * - 아직 기기 행이 없거나(알림 등록 전) 실패하면 기억하지 않고, 같은 값은 1분 안에 다시 보내지 않는다.
 * - 절대 throw 하지 않는다(화면 동작 영향 0).
 */
export const DEVICE_APP_LANGUAGE_REPORTED_KEY = "dibay_device_app_language_reported";
const RETRY_GAP_MS = 60_000;

let inFlightKey: string | null = null;
const lastAttemptAt = new Map<string, number>();

function readReported(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_APP_LANGUAGE_REPORTED_KEY);
  } catch {
    return null;
  }
}

function writeReported(key: string): void {
  try {
    window.localStorage.setItem(DEVICE_APP_LANGUAGE_REPORTED_KEY, key);
  } catch {
    /* 저장 불가 — 다음에 다시 보냄 */
  }
}

export function deviceAppLanguageReportKey(userId: string, deviceId: string, language: AppLanguageCode): string {
  return `${userId}|${deviceId}|${language}`;
}

export async function reportDeviceAppLanguage(
  userId: string | null | undefined,
  language: AppLanguageCode,
  now: () => number = Date.now
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const uid = userId?.trim();
  if (!uid) return false;
  let deviceId = "";
  try {
    deviceId = ensureClientInstanceId();
  } catch {
    return false;
  }
  if (!deviceId) return false;
  const key = deviceAppLanguageReportKey(uid, deviceId, language);
  if (readReported() === key || inFlightKey === key) return false;
  const last = lastAttemptAt.get(key);
  if (last != null && now() - last < RETRY_GAP_MS) return false;
  lastAttemptAt.set(key, now());
  inFlightKey = key;
  try {
    const res = await fetch("/api/me/devices/app-language", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, language }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; updated?: number } | null;
    if (res.ok && json?.ok === true && Number(json.updated) > 0) {
      writeReported(key);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (inFlightKey === key) inFlightKey = null;
  }
}

/** 테스트 전용 */
export function resetDeviceAppLanguageReportForTests(): void {
  inFlightKey = null;
  lastAttemptAt.clear();
}

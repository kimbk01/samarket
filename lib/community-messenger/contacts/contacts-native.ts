/**
 * 연락처 읽기 네이티브 다리 (Android `DibayContactsPlugin` · iOS `DibayContactsPlugin`).
 * 번호와 연락처 ID 만 쓰고, 이름은 기기 안 화면 표시에만 쓴다 (서버로 보내지 않음 — SSOT v5 §1-7).
 * 플러그인이 없는 구 바이너리·웹·Windows 는 `isContactsNativeAvailable() === false` → 화면은 「앱 업데이트」/보기 전용.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type ContactsNativePermission = "granted" | "limited" | "denied" | "prompt";
export type ContactsNativeContact = { id: string; name: string; numbers: string[] };

type DibayContactsPlugin = {
  checkPermission(): Promise<{ state: ContactsNativePermission }>;
  requestPermission(): Promise<{ state: ContactsNativePermission }>;
  readPhoneContacts(): Promise<{ contacts: ContactsNativeContact[] }>;
  openAppSettings(): Promise<void>;
};

const DibayContacts = registerPlugin<DibayContactsPlugin>("DibayContacts");

export function contactsNativePlatform(): "android" | "ios" | null {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : null;
  } catch {
    return null;
  }
}

/** 네이티브 앱 + 연락처 플러그인이 들어 있는 바이너리 */
export function isContactsNativeAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && contactsNativePlatform() !== null && Capacitor.isPluginAvailable("DibayContacts");
  } catch {
    return false;
  }
}

/** 앱인데 연락처 플러그인이 없는 예전 바이너리 — 「앱 업데이트」 안내 대상 */
export function isContactsAppUpdateNeeded(): boolean {
  return contactsNativePlatform() !== null && !isContactsNativeAvailable();
}

function normalizeState(raw: unknown): ContactsNativePermission {
  return raw === "granted" || raw === "limited" || raw === "denied" ? raw : "prompt";
}

export async function checkContactsPermission(): Promise<ContactsNativePermission> {
  if (!isContactsNativeAvailable()) return "denied";
  try {
    return normalizeState((await DibayContacts.checkPermission()).state);
  } catch {
    return "denied";
  }
}

export async function requestContactsPermission(): Promise<ContactsNativePermission> {
  if (!isContactsNativeAvailable()) return "denied";
  try {
    return normalizeState((await DibayContacts.requestPermission()).state);
  } catch {
    return "denied";
  }
}

export async function readPhoneContacts(): Promise<ContactsNativeContact[]> {
  if (!isContactsNativeAvailable()) return [];
  const out = await DibayContacts.readPhoneContacts();
  return Array.isArray(out?.contacts)
    ? out.contacts
        .filter((c) => c && typeof c.id === "string" && Array.isArray(c.numbers))
        .map((c) => ({ id: c.id, name: typeof c.name === "string" ? c.name : "", numbers: c.numbers.filter((n) => typeof n === "string") }))
    : [];
}

export async function openContactsAppSettings(): Promise<void> {
  if (!isContactsNativeAvailable()) return;
  try {
    await DibayContacts.openAppSettings();
  } catch {
    /* 설정 화면을 못 열어도 화면 동작에는 영향 없음 */
  }
}

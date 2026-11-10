/**
 * 기기 안 연락처 비교 (서버 호출 없이) — SSOT v5 §4 S4·S7.
 * 기기 연락처 → E.164 번호별 client_ref(기기 연락처 ID 의 해시) 표 → 이전 표와 비교해 추가·삭제분만 만든다.
 */
import { normalizeContactPhoneE164 } from "@/lib/community-messenger/contacts/contacts-contract";
import type { ContactsNativeContact } from "@/lib/community-messenger/contacts/contacts-native";

export type ContactsNumberMap = Record<string, string>; // e164 → client_ref
export type ContactsNameMap = Record<string, string>; // client_ref → 기기 연락처 이름 (기기 안에서만)

/** FNV-1a 64비트 16진수 — 기기 연락처 ID 를 그대로 보내지 않기 위한 짧은 해시 (보안 목적 아님) */
export function contactsClientRef(deviceContactId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < deviceContactId.length; i += 1) {
    const c = deviceContactId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return `c${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function buildContactsNumberMap(
  contacts: ContactsNativeContact[],
  defaultCountry: "PH" | "KR"
): { numbers: ContactsNumberMap; names: ContactsNameMap } {
  const numbers: ContactsNumberMap = {};
  const names: ContactsNameMap = {};
  for (const c of contacts) {
    const ref = contactsClientRef(c.id);
    for (const raw of c.numbers) {
      const e164 = normalizeContactPhoneE164(raw, defaultCountry);
      if (!e164 || numbers[e164]) continue;
      numbers[e164] = ref;
      if (c.name && !names[ref]) names[ref] = c.name;
    }
  }
  return { numbers, names };
}

export type ContactsDiff = { add: { e164: string; ref: string }[]; remove: string[] };

export function diffContactsNumberMaps(prev: ContactsNumberMap, next: ContactsNumberMap): ContactsDiff {
  const add: { e164: string; ref: string }[] = [];
  const remove: string[] = [];
  for (const [e164, ref] of Object.entries(next)) {
    if (prev[e164] !== ref) add.push({ e164, ref });
  }
  for (const e164 of Object.keys(prev)) {
    if (!(e164 in next)) remove.push(e164);
  }
  return { add, remove };
}

/** 스냅숏 조각 (1,000개씩) */
export function chunkContactsForSnapshot(numbers: ContactsNumberMap, size = 1000): { e164: string; ref: string }[][] {
  const all = Object.entries(numbers).map(([e164, ref]) => ({ e164, ref }));
  if (all.length === 0) return [[]];
  const out: { e164: string; ref: string }[][] = [];
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

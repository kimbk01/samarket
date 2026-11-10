/**
 * 기기 안 연락처 상태 (회원별 키) — 원 번호·이름은 이 기기에만 둔다.
 * 다른 회원이 이 기기에 로그인하면 이전 회원 키는 지운다 (SSOT v5 §8 로그아웃 행).
 */
import type { ContactsNameMap, ContactsNumberMap } from "@/lib/community-messenger/contacts/contacts-diff";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

const PREFIX = "dibay:cm-contacts:v1:";

export type ContactsLocalState = {
  consented: boolean;
  defaultCountry: "PH" | "KR";
  sourceId: string | null;
  deviceVersion: number | null;
  numbers: ContactsNumberMap | null;
  names: ContactsNameMap;
  lastSyncAt: number | null;
  lastHeartbeatDay: string | null;
  lastPermission: "granted" | "limited" | "denied" | "prompt" | null;
  revokePending: boolean;
  listToken: string | null;
  members: ContactsMemberRow[];
  friendIds: string[];
  /** 다른 기기 동기화가 있어 「이 기기도 추가할까요?」 를 아직 답하지 않음 */
  newDeviceAsked: boolean;
};

export function emptyContactsLocalState(): ContactsLocalState {
  return {
    consented: false,
    defaultCountry: "PH",
    sourceId: null,
    deviceVersion: null,
    numbers: null,
    names: {},
    lastSyncAt: null,
    lastHeartbeatDay: null,
    lastPermission: null,
    revokePending: false,
    listToken: null,
    members: [],
    friendIds: [],
    newDeviceAsked: false,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readContactsLocalState(userId: string): ContactsLocalState {
  const ls = safeStorage();
  if (!ls || !userId) return emptyContactsLocalState();
  try {
    const raw = ls.getItem(PREFIX + userId);
    if (!raw) return emptyContactsLocalState();
    return { ...emptyContactsLocalState(), ...(JSON.parse(raw) as Partial<ContactsLocalState>) };
  } catch {
    return emptyContactsLocalState();
  }
}

export function writeContactsLocalState(userId: string, next: ContactsLocalState): void {
  const ls = safeStorage();
  if (!ls || !userId) return;
  try {
    ls.setItem(PREFIX + userId, JSON.stringify(next));
  } catch {
    /* 저장 공간 부족 등 — 다음 실행에서 전체 스냅숏으로 복구 */
  }
}

export function patchContactsLocalState(userId: string, patch: Partial<ContactsLocalState>): ContactsLocalState {
  const next = { ...readContactsLocalState(userId), ...patch };
  writeContactsLocalState(userId, next);
  return next;
}

/** 이 기기에서 다른 회원의 연락처 상태 삭제 */
export function purgeOtherUsersContactsLocalState(userId: string): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX) && k !== PREFIX + userId) drop.push(k);
    }
    for (const k of drop) ls.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function clearContactsDeviceData(userId: string): ContactsLocalState {
  return patchContactsLocalState(userId, { sourceId: null, deviceVersion: null, numbers: null, names: {}, lastSyncAt: null });
}

/** 이 기기 번호(e164) 찾기 — client_ref 로 */
export function findLocalNumberByRef(state: ContactsLocalState, ref: string | null): string | null {
  if (!ref || !state.numbers) return null;
  for (const [e164, r] of Object.entries(state.numbers)) if (r === ref) return e164;
  return null;
}

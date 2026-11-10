/**
 * 기기 안 연락처 상태 (회원별 키) — 원 번호·이름은 이 기기에만 둔다.
 * 다른 회원이 이 기기에 로그인하면 이전 회원 키는 지운다 (SSOT v5 §8 로그아웃 행).
 */
import type { ContactsNameMap, ContactsNumberMap } from "@/lib/community-messenger/contacts/contacts-diff";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

export const CONTACTS_LOCAL_PREFIX = "dibay:cm-contacts:v1:";
const PREFIX = CONTACTS_LOCAL_PREFIX;

/** 서버가 업로드를 멈춘 이유 — 이 값이 있으면 엔진은 연락처를 읽지도 올리지도 않는다 (감사 A5) */
export type ContactsStopReason = "device_sync_off" | "account_sync_off" | "permission_denied" | "source_inactive" | "consent_required";

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
  /** 서버에 이 기기 권한을 「꺼짐」으로 알린 상태 — 다시 허용되면 서버도 되돌린다 (감사 A4) */
  serverPermissionDenied: boolean;
  /** 서버 중지 이유 · 그 필리핀 날짜 (다음 날 하루 1회 갱신 때 다시 확인) */
  stoppedReason: ContactsStopReason | null;
  stoppedDay: string | null;
  /** 하루 한도(daily_limit·resync_limit·rate) 에 걸린 필리핀 날짜 — 그날은 다시 올리지 않음 */
  limitDay: string | null;
  /** 어드민 「요청당 번호 한도」 (서버 응답값) — 조각 크기 (감사 A8) */
  requestNumberLimit: number | null;
  /** 이 기기 연락처 중 초대에서 뺄 항목 (친구·숨김·차단 — 서버 known_refs) */
  knownRefs: string[];
  /** 권한 철회 안내에 보여 줄 「이미 올린 n개」 (철회 감지 시점 이 기기 번호 수) */
  revokeCount: number;
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
    serverPermissionDenied: false,
    stoppedReason: null,
    stoppedDay: null,
    limitDay: null,
    requestNumberLimit: null,
    knownRefs: [],
    revokeCount: 0,
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

/** 이 기기 연락처 데이터 삭제 (원 번호·이름·목록 사본까지) */
export function clearContactsDeviceData(userId: string): ContactsLocalState {
  return patchContactsLocalState(userId, {
    sourceId: null,
    deviceVersion: null,
    numbers: null,
    names: {},
    lastSyncAt: null,
    lastHeartbeatDay: null,
    members: [],
    friendIds: [],
    knownRefs: [],
    listToken: null,
    serverPermissionDenied: false,
    stoppedReason: null,
    stoppedDay: null,
    limitDay: null,
  });
}

/** 회원이 다시 켜거나 동의함 → 중지·한도 표시 해제 (다음 실행에서 서버가 다시 판정) */
export function clearContactsStop(userId: string): void {
  if (!userId) return;
  patchContactsLocalState(userId, { stoppedReason: null, stoppedDay: null, limitDay: null });
}

/** 동의 여부만 가볍게 읽기 (전체 JSON 파싱 없이 — 메신저 진입 시 사용) */
export function readContactsConsentedFlag(userId: string): boolean {
  const ls = safeStorage();
  if (!ls || !userId) return false;
  try {
    const raw = ls.getItem(PREFIX + userId);
    return Boolean(raw && raw.includes('"consented":true'));
  } catch {
    return false;
  }
}

/** 이 기기 번호(e164) 찾기 — client_ref 로 */
export function findLocalNumberByRef(state: ContactsLocalState, ref: string | null): string | null {
  if (!ref || !state.numbers) return null;
  for (const [e164, r] of Object.entries(state.numbers)) if (r === ref) return e164;
  return null;
}

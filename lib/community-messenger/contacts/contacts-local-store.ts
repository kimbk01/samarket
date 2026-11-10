/**
 * 기기 안 연락처 상태 (회원별 키) — 원 번호·이름은 이 기기에만 둔다.
 * 다른 회원이 이 기기에 로그인하면 이전 회원 키는 지운다 (SSOT v5 §8 로그아웃 행).
 *
 * 저장값 3개 (실기 감사 2026-11-11 — 주소록 전체가 한 값에 있어 친구 탭·화면 이동마다 300KB~1MB 를 통째로 읽던 문제):
 * - `PREFIX + 회원` = 작은 상태 (동의·권한·출처·목록 사본·보이는 회원 이름) — 자주 지나는 경로는 이것만 읽는다.
 * - `PREFIX + 회원 + "#n"` = 비교 번호표 (E.164 → client_ref) — 동기화 엔진·초대 목록·휴대폰 전화 번호 찾기만 읽는다.
 * - `PREFIX + 회원 + "#m"` = 주소록 이름표 (client_ref → 이름) — 동기화 엔진·연락처 화면 초대 목록만 읽는다.
 * 옛 한 덩어리 값은 처음 읽을 때 1번 나눠 옮긴다.
 */
import type { ContactsNameMap, ContactsNumberMap } from "@/lib/community-messenger/contacts/contacts-diff";
import { contactsManilaDay, type ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

export const CONTACTS_LOCAL_PREFIX = "dibay:cm-contacts:v1:";
/** 권한 철회 안내가 새로 생김 (엔진 → 앱 전체 안내) */
export const CONTACTS_REVOKE_PENDING_EVENT = "dibay:contacts-revoke-pending";
/** 기기 안 연락처 상태가 바뀜 (철회 답 등 → 열린 연락처 화면이 다시 읽음) */
export const CONTACTS_CHANGED_EVENT = "dibay:contacts-changed";
const PREFIX = CONTACTS_LOCAL_PREFIX;
const NUMBERS_SUFFIX = "#n";
const NAMES_SUFFIX = "#m";

/** 서버가 업로드를 멈춘 이유 — 이 값이 있으면 엔진은 연락처를 읽지도 올리지도 않는다 (감사 A5) */
export type ContactsStopReason =
  | "device_sync_off"
  | "account_sync_off"
  | "permission_denied"
  | "source_inactive"
  | "consent_required"
  /** 어드민 킬스위치 꺼짐 — 그날은 다시 묻지 않는다 */
  | "feature_off"
  /** 회원이 이 기기 연락처를 지움(이 기기·다른 기기·전체·권한 철회 「지우기」) — 이 기기에서 다시 켤 때까지 (감사 A9) */
  | "source_removed";

/** 끊긴 전체 업로드를 이어 올리기 위한 진행 위치 (조각 크기·개수·내용 지문이 같을 때만 이어감) */
export type ContactsSnapshotProgress = { generation: number; nextChunk: number; total: number; size: number; fingerprint: string };


export type ContactsLocalState = {
  consented: boolean;
  defaultCountry: "PH" | "KR";
  sourceId: string | null;
  deviceVersion: number | null;
  /** 비교 번호표 개수 — null 이면 번호표 없음(처음·삭제 후 → 전체 스냅숏). 번호표 자체는 `readContactsNumbers` */
  numbersCount: number | null;
  /** 목록에 보이는 회원(이 기기 연락처)의 기기 안 이름만 — 친구 탭·연락처 화면 표시용. 전체 이름표는 `readContactsNames` */
  memberNames: ContactsNameMap;
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
  /**
   * 이 기기에서 연락처 올리기를 회원이 허락함 (동의·「이 기기도 추가」·권한 허용을 이 기기에서 함 — #11).
   * 다른 기기에서 동의한 계정이라도 이 기기는 묻기 전까지 읽지도 올리지도 않는다.
   */
  deviceApproved: boolean;
  snapshotProgress: ContactsSnapshotProgress | null;
  /** 친구 중 이 기기 연락처에 있는 회원 → client_ref (친구 프로필 「음성」 통화 선택 — 4단계 C1) */
  friendRefs: Record<string, string>;
  /** 기본 통화 방식 (설정 응답값 보관 — 친구 프로필 통화 선택이 쓴다) */
  callDefault: "ask" | "dibay" | "phone";
};

export function emptyContactsLocalState(): ContactsLocalState {
  return {
    consented: false,
    defaultCountry: "PH",
    sourceId: null,
    deviceVersion: null,
    numbersCount: null,
    memberNames: {},
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
    deviceApproved: false,
    snapshotProgress: null,
    friendRefs: {},
    callDefault: "ask",
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function ownKeys(userId: string): string[] {
  return [PREFIX + userId, PREFIX + userId + NUMBERS_SUFFIX, PREFIX + userId + NAMES_SUFFIX];
}

function readJson<T>(ls: Storage, key: string): T | null {
  const raw = ls.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

/** 옛 한 덩어리 값(numbers·names 포함)을 3개로 나눈다 — 1번만 */
function splitLegacy(ls: Storage, userId: string, parsed: Record<string, unknown>): Partial<ContactsLocalState> {
  const numbers = parsed.numbers as ContactsNumberMap | null | undefined;
  const names = parsed.names as ContactsNameMap | undefined;
  const rest: Record<string, unknown> = { ...parsed };
  delete rest.numbers;
  delete rest.names;
  let numbersSaved = false;
  try {
    if (numbers && typeof numbers === "object") {
      ls.setItem(PREFIX + userId + NUMBERS_SUFFIX, JSON.stringify(numbers));
      numbersSaved = true;
    }
    if (names && typeof names === "object" && Object.keys(names).length > 0) {
      ls.setItem(PREFIX + userId + NAMES_SUFFIX, JSON.stringify(names));
    }
  } catch {
    /* 저장 공간 부족 — 번호표 없음으로 두면 다음 동기화가 전체 스냅숏으로 복구 */
  }
  const members = Array.isArray(rest.members) ? (rest.members as ContactsMemberRow[]) : [];
  rest.numbersCount = numbersSaved && numbers ? Object.keys(numbers).length : null;
  rest.memberNames = names && typeof names === "object" ? pickMemberNames(members, names) : {};
  try {
    ls.setItem(PREFIX + userId, JSON.stringify({ ...emptyContactsLocalState(), ...rest }));
  } catch {
    /* ignore */
  }
  return rest as Partial<ContactsLocalState>;
}

/** 작은 상태 읽기 — 번호표·전체 이름표는 읽지 않는다 */
export function readContactsLocalState(userId: string): ContactsLocalState {
  const ls = safeStorage();
  if (!ls || !userId) return emptyContactsLocalState();
  try {
    const parsed = readJson<Record<string, unknown>>(ls, PREFIX + userId);
    if (!parsed) return emptyContactsLocalState();
    const data = "numbers" in parsed || "names" in parsed ? splitLegacy(ls, userId, parsed) : (parsed as Partial<ContactsLocalState>);
    return { ...emptyContactsLocalState(), ...data };
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

/** 비교 번호표 (E.164 → client_ref) — 없으면 null. 동기화 엔진·초대 목록·휴대폰 전화만 읽는다 */
export function readContactsNumbers(userId: string): ContactsNumberMap | null {
  const ls = safeStorage();
  if (!ls || !userId) return null;
  try {
    const small = readContactsLocalState(userId); // 옛 값이면 먼저 나눈다
    if (small.numbersCount === null) return null;
    return readJson<ContactsNumberMap>(ls, PREFIX + userId + NUMBERS_SUFFIX);
  } catch {
    return null;
  }
}

/** 비교 번호표 저장 (null = 삭제) — 작은 상태의 개수도 함께. 저장 실패면 번호표 없음(다음에 전체 스냅숏) */
export function writeContactsNumbers(userId: string, numbers: ContactsNumberMap | null): ContactsLocalState {
  const ls = safeStorage();
  let saved = false;
  if (ls && userId) {
    try {
      if (numbers) {
        ls.setItem(PREFIX + userId + NUMBERS_SUFFIX, JSON.stringify(numbers));
        saved = true;
      } else {
        ls.removeItem(PREFIX + userId + NUMBERS_SUFFIX);
      }
    } catch {
      saved = false;
    }
  }
  return patchContactsLocalState(userId, { numbersCount: saved && numbers ? Object.keys(numbers).length : null });
}

/** 주소록 이름표 (client_ref → 이름) — 동기화 엔진·연락처 화면 초대 목록만 읽는다 */
export function readContactsNames(userId: string): ContactsNameMap {
  const ls = safeStorage();
  if (!ls || !userId) return {};
  try {
    readContactsLocalState(userId);
    return readJson<ContactsNameMap>(ls, PREFIX + userId + NAMES_SUFFIX) ?? {};
  } catch {
    return {};
  }
}

/** 주소록 이름표 저장 + 보이는 회원 이름 갱신 */
export function writeContactsNames(userId: string, names: ContactsNameMap): ContactsLocalState {
  const ls = safeStorage();
  if (ls && userId) {
    try {
      if (Object.keys(names).length > 0) ls.setItem(PREFIX + userId + NAMES_SUFFIX, JSON.stringify(names));
      else ls.removeItem(PREFIX + userId + NAMES_SUFFIX);
    } catch {
      /* ignore */
    }
  }
  const cur = readContactsLocalState(userId);
  return patchContactsLocalState(userId, { memberNames: pickMemberNames(cur.members, names) });
}

/** 보이는 회원(이 기기 연락처) 이름만 고른다 */
export function pickMemberNames(members: ContactsMemberRow[], names: ContactsNameMap): ContactsNameMap {
  const keep: ContactsNameMap = {};
  for (const m of members) {
    const ref = m.on_this_device ? m.client_ref : null;
    if (ref && names[ref]) keep[ref] = names[ref];
  }
  return keep;
}

/**
 * 서버 목록이 바뀜 → 작은 상태에 목록 사본을 쓰고 보이는 회원 이름을 맞춘다.
 * 새로 보이는 회원 이름이 작은 상태에 없을 때만 전체 이름표를 읽는다 (보통은 읽지 않음).
 */
export function applyContactsListToLocal(
  userId: string,
  patch: Pick<ContactsLocalState, "members" | "friendIds" | "knownRefs" | "friendRefs" | "listToken">
): ContactsLocalState {
  const cur = readContactsLocalState(userId);
  const missing = patch.members.some((m) => m.on_this_device && m.client_ref && !(m.client_ref in cur.memberNames));
  const source = missing ? readContactsNames(userId) : cur.memberNames;
  return patchContactsLocalState(userId, { ...patch, memberNames: pickMemberNames(patch.members, source) });
}

/** 이 기기에서 다른 회원의 연락처 상태 삭제 */
export function purgeOtherUsersContactsLocalState(userId: string): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    const drop: string[] = [];
    const own = new Set(ownKeys(userId));
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX) && !own.has(k)) drop.push(k);
    }
    for (const k of drop) ls.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** 이 기기 연락처 데이터 삭제 (원 번호·이름·목록 사본까지) */
export function clearContactsDeviceData(userId: string): ContactsLocalState {
  const ls = safeStorage();
  if (ls && userId) {
    try {
      ls.removeItem(PREFIX + userId + NUMBERS_SUFFIX);
      ls.removeItem(PREFIX + userId + NAMES_SUFFIX);
    } catch {
      /* ignore */
    }
  }
  return patchContactsLocalState(userId, {
    sourceId: null,
    deviceVersion: null,
    numbersCount: null,
    memberNames: {},
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
    snapshotProgress: null,
    // 지운 기기는 회원이 이 기기에서 다시 켜기 전까지 올리지 않는다 (감사 A9)
    deviceApproved: false,
  });
}

/** 회원이 끔 → 서버 응답을 기다리지 않고 이 기기도 바로 멈춘다 (읽기·올리기 안 함 — 최종 점검 N3) */
export function markContactsStopped(userId: string, reason: ContactsStopReason): void {
  if (!userId) return;
  patchContactsLocalState(userId, { stoppedReason: reason, stoppedDay: contactsManilaDay() });
}

/** 회원이 다시 켜거나 동의함 → 중지·한도 표시 해제 (다음 실행에서 서버가 다시 판정) */
export function clearContactsStop(userId: string): void {
  if (!userId) return;
  patchContactsLocalState(userId, { stoppedReason: null, stoppedDay: null, limitDay: null });
}

/** 권한 철회 안내 대기 여부만 가볍게 (앱 시작 시 · 전체 파싱 없음) */
export function readContactsRevokePendingFlag(userId: string): boolean {
  const ls = safeStorage();
  if (!ls || !userId) return false;
  try {
    const raw = ls.getItem(PREFIX + userId);
    return Boolean(raw && raw.includes('"revokePending":true'));
  } catch {
    return false;
  }
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

/**
 * 업로드가 멈추면(권한 철회·중지) 기기 안 이름표는 목록에 보이는 회원 것만 남긴다 —
 * 연락처를 더 읽지 않는데 주소록 전체 이름을 계속 들고 있지 않도록 (최종 점검 #8).
 * 번호표는 지운다 (다시 켜면 전체 스냅숏).
 */
export function shrinkContactsDeviceDataToListed(userId: string): ContactsLocalState {
  const cur = readContactsLocalState(userId);
  writeContactsNumbers(userId, null);
  return writeContactsNames(userId, cur.memberNames);
}

/** 이 기기 번호(e164) 찾기 — client_ref 로 */
export function findLocalNumberByRef(numbers: ContactsNumberMap | null, ref: string | null): string | null {
  if (!ref || !numbers) return null;
  for (const [e164, r] of Object.entries(numbers)) if (r === ref) return e164;
  return null;
}
